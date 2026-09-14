import { Component, OnInit, ChangeDetectionStrategy, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PageShell } from '../../shared/page-shell/page-shell';
import { AuthService } from '../auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';

interface NotificationPreferences {
  email: boolean;
  push: boolean;
  pickupReminders: boolean;
  opportunityUpdates: boolean;
}

const PREFS_STORAGE_KEY = 'wastezero_notification_prefs';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: true,
  push: true,
  pickupReminders: true,
  opportunityUpdates: false,
};

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, PageShell],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit {
  currentUser: any = null;

  readonly isDarkMode: Signal<boolean>;

  preferences: NotificationPreferences = { ...DEFAULT_PREFERENCES };
  savedMessage = '';

  // Account deletion confirmation state
  isDeleteConfirmOpen = false;
  isDeleting = false;
  deleteError = '';

  constructor(
    private authService: AuthService,
    private themeService: ThemeService,
    private router: Router
  ) {
    this.isDarkMode = this.themeService.isDarkMode;
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.preferences = this.loadPreferences();
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  togglePreference(key: keyof NotificationPreferences): void {
    this.preferences[key] = !this.preferences[key];
    this.persistPreferences();
  }

  private loadPreferences(): NotificationPreferences {
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_PREFERENCES };
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  private persistPreferences(): void {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(this.preferences));
    } catch {
      // Non-fatal - preferences just won't persist across sessions.
    }
    this.savedMessage = 'Preferences saved';
    setTimeout(() => (this.savedMessage = ''), 2000);
  }

  goToChangePassword(): void {
    this.router.navigate(['/profile'], { queryParams: { tab: 'password' } });
  }

  openDeleteConfirm(): void {
    this.isDeleteConfirmOpen = true;
    this.deleteError = '';
  }

  cancelDeleteConfirm(): void {
    this.isDeleteConfirmOpen = false;
  }

  confirmDeleteAccount(): void {
    this.isDeleting = true;
    this.deleteError = '';

    this.authService.deleteAccount().subscribe({
      next: () => {
        localStorage.removeItem('wastezero_token');
        localStorage.removeItem('wastezero_user');
        this.isDeleting = false;
        this.router.navigate(['/auth']);
      },
      error: (err: any) => {
        this.deleteError = err.error?.message || 'Could not delete your account. Please try again.';
        this.isDeleting = false;
      },
    });
  }
}
