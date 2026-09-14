import { Component, ChangeDetectionStrategy, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { CryptoService } from '../../core/crypto/crypto.service';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './auth.html',
  styleUrls: ['./auth.scss']
})
export class AuthComponent {
  activeTab: 'login' | 'register' = 'login';
  showOtpModal: boolean = false;
  otpValue: string = '';
  passwordMismatch: boolean = false;
  registeredEmail: string = '';

  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', Validators.required)
  });

  registerForm = new FormGroup({
    fullName: new FormControl('', Validators.required),
    email: new FormControl('', [Validators.required, Validators.email]),
    username: new FormControl('', Validators.required),
    password: new FormControl('', [Validators.required, Validators.minLength(8)]),
    confirmPassword: new FormControl('', Validators.required),
    role: new FormControl('volunteer', Validators.required) 
  });

  readonly isDarkMode: Signal<boolean>;

  constructor(
    private router: Router,
    private authService: AuthService,
    private cryptoService: CryptoService,
    private themeService: ThemeService
  ) {
    this.isDarkMode = this.themeService.isDarkMode;
  }

  switchTab(tab: 'login' | 'register') { this.activeTab = tab; }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  onLogin() {
    if (this.loginForm.valid) {
      const password = this.loginForm.value.password as string;

      this.authService.login(this.loginForm.value).subscribe({
        next: (res: any) => {
          const responseData = res.data || res;
          
          console.log('Login Response:', responseData);

          if (responseData.accessToken) {
            this.authService.setToken(responseData.accessToken);
          } else {
            console.error('No accessToken found in the login response!');
          }
          
          if (responseData.user) {
            this.authService.setUser(responseData.user);
          }

          this.setUpEncryptionKeys(responseData.user, password);

          this.router.navigate(['/dashboard']);
        },
        error: (err) => alert(err.error?.message || 'Login failed')
      });
    } else {
      this.loginForm.markAllAsTouched();
    }
  }

  onRegister() {
    this.passwordMismatch = false;
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    if (this.registerForm.value.password !== this.registerForm.value.confirmPassword) {
      this.passwordMismatch = true;
      return;
    }

    const { confirmPassword, fullName, username, ...rest } = this.registerForm.value;
    const userData = { ...rest, name: fullName };

    this.authService.register(userData).subscribe({
      next: (response) => {
        this.registeredEmail = userData.email as string;
        this.showOtpModal = true;
      },
      error: (err) => {
        const errorMessage = err.error?.errors?.[0] || err.error?.message || 'Registration failed.';
        alert(errorMessage);
      }
    });
  }

  // Makes sure this device has (and has published) an E2E encryption key
  // pair for the logged-in user, so their messages can be encrypted/
  // decrypted - restoring the account's ORIGINAL key pair from its
  // password-wrapped backup when this device doesn't have one locally yet,
  // rather than generating a fresh, history-incompatible one. This is
  // local-only/network work that shouldn't block navigation, so it runs
  // fire-and-forget.
  private async setUpEncryptionKeys(user: any, password: string): Promise<void> {
    const userId = user?._id || user?.id;
    if (!userId || !password) return;

    try {
      const hasLocalKeyPair = await this.cryptoService.hasLocalKeyPair(userId);

      if (!hasLocalKeyPair) {
        const backup = await this.fetchKeyBackup();
        if (backup) {
          const restored = await this.cryptoService.restoreKeyBackup(userId, password, backup);
          if (restored) {
            // Backup restored successfully - this device now has the
            // account's original key pair and can decrypt message history.
            // Nothing left to publish; the public key is already on record.
            return;
          }
          // Password didn't unlock the backup (e.g. it predates a password
          // change). Fall through and generate a fresh, working key pair
          // rather than blocking the user out of messaging entirely.
          console.error('Could not decrypt key backup with the current password; generating a new key pair.');
        }
      }

      const publicKey = await this.cryptoService.ensureKeyPair(userId);
      this.authService.setPublicKey(publicKey).subscribe();

      // Make sure a backup of THIS key pair exists on the server, so a
      // future second device can recover it. Covers first-ever login and
      // legacy accounts that predate the backup feature.
      const existingBackup = hasLocalKeyPair ? await this.fetchKeyBackup() : null;
      if (!existingBackup) {
        const backup = await this.cryptoService.createKeyBackup(userId, password);
        if (backup) {
          this.authService.setKeyBackup(backup).subscribe({
            error: (err) => console.error('Failed to upload key backup', err)
          });
        }
      }
    } catch (err) {
      console.error('Failed to set up encryption keys', err);
    }
  }

  private async fetchKeyBackup(): Promise<any | null> {
    try {
      const res: any = await firstValueFrom(this.authService.getKeyBackup());
      const data = res?.data || res;
      return data?.keyBackup || null;
    } catch {
      return null;
    }
  }

  closeOtpModal() { this.showOtpModal = false; this.otpValue = ''; }

  submitRegistrationOtp() {
    this.authService.verifyEmail(this.registeredEmail, this.otpValue).subscribe({
      next: () => {
        alert('Verified successfully!');
        this.closeOtpModal();
        this.registerForm.reset({ role: 'volunteer' });
        this.switchTab('login');
      },
      error: (err) => alert(err.error?.message || 'Invalid OTP')
    });
  }
}