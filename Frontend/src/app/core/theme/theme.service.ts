import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'wastezero_theme';
const DARK_CLASS = 'dark-theme';

/**
 * Centralized dark/light theme handling.
 *
 * The active theme is stored as a class (`dark-theme`) on the <html>
 * element, which lets our global SCSS variables (in styles.scss) and any
 * component-level `:host-context(.dark-theme)` rules react to it.
 *
 * The chosen theme is persisted to localStorage so it survives refreshes
 * and is respected across every page (login/registration included, since
 * that page is rendered before a user is authenticated).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly darkMode = signal<boolean>(this.readInitialTheme());

  readonly isDarkMode = this.darkMode.asReadonly();

  constructor() {
    this.applyTheme(this.darkMode());
  }

  toggleTheme(): void {
    this.setDarkMode(!this.darkMode());
  }

  setDarkMode(isDark: boolean): void {
    this.darkMode.set(isDark);
    this.applyTheme(isDark);
    try {
      localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // localStorage may be unavailable (e.g. private browsing) - theme
      // will simply reset to default on next load, which is fine.
    }
  }

  private readInitialTheme(): boolean {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
    } catch {
      // Ignore - fall through to system preference.
    }

    return typeof window !== 'undefined' &&
      !!window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private applyTheme(isDark: boolean): void {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle(DARK_CLASS, isDark);
  }
}
