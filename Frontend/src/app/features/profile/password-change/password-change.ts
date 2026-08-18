import { Component, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, FormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../auth/auth.service';
import { CryptoService } from '../../../core/crypto/crypto.service';

// Custom validator to check if newPassword and confirmPassword match perfectly
export function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const newPassword = control.get('newPassword')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  
  if (newPassword && confirmPassword && newPassword !== confirmPassword) {
    return { passwordMismatch: true };
  }
  return null;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-password-change',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, FormsModule],
  templateUrl: './password-change.html',
  styleUrls: ['./password-change.scss']
})
export class PasswordChangeComponent {
  showOtpModal: boolean = false;
  otpValue: string = '';
  
  isLoading: boolean = false;
  successMessage: string = '';
  errorMessage: string = '';

  passwordForm = new FormGroup({
    currentPassword: new FormControl('', Validators.required),
    newPassword: new FormControl('', [Validators.required, Validators.minLength(8)]),
    confirmPassword: new FormControl('', Validators.required)
  }, { validators: passwordMatchValidator }); // Apply the custom validator to the whole form

  constructor(
    private authService: AuthService,
    private cryptoService: CryptoService,
    private cdr: ChangeDetectorRef
  ) {}

  onSubmit() {
    if (this.passwordForm.invalid) return;

    this.isLoading = true;
    this.successMessage = '';
    this.errorMessage = '';

    const currentPassword = this.passwordForm.get('currentPassword')?.value;

    this.authService.initiatePasswordChange(currentPassword!).subscribe({
      next: () => {
        this.isLoading = false;
        this.showOtpModal = true;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Incorrect current password or server error.';
        this.cdr.detectChanges();
      }
    });
  }

  closeOtpModal() {
    this.showOtpModal = false;
    this.otpValue = '';
  }

  submitOtp() {
    if (!this.otpValue) {
      this.errorMessage = 'Please enter the OTP';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    const newPassword = this.passwordForm.get('newPassword')?.value;

    this.authService.confirmPasswordChange(this.otpValue, newPassword!).subscribe({
      next: () => {
        this.isLoading = false;
        this.successMessage = 'Password changed successfully!';
        this.closeOtpModal();
        this.passwordForm.reset();
        this.cdr.detectChanges();

        // The KEK protecting the E2EE key backup is derived from the
        // password. Re-wrap this device's local key pair under the NEW
        // password so a future second-device login can still recover it -
        // otherwise the backup silently goes stale after this change.
        this.reEncryptKeyBackup(newPassword!);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Invalid OTP. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }

  private async reEncryptKeyBackup(newPassword: string): Promise<void> {
    const user = this.authService.getCurrentUser();
    const userId = user?._id || user?.id;
    if (!userId) return;

    try {
      const hasLocalKeyPair = await this.cryptoService.hasLocalKeyPair(userId);
      if (!hasLocalKeyPair) return;

      const backup = await this.cryptoService.createKeyBackup(userId, newPassword);
      if (backup) {
        this.authService.setKeyBackup(backup).subscribe({
          error: (err) => console.error('Failed to refresh key backup after password change', err)
        });
      }
    } catch (err) {
      console.error('Failed to refresh key backup after password change', err);
    }
  }
}