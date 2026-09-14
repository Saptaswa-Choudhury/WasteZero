import { Component, EventEmitter, Output, OnInit, ChangeDetectionStrategy, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../features/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar implements OnInit {
  @Output() close = new EventEmitter<void>();
  currentUser: any = null;

  readonly isDarkMode: Signal<boolean>;

  constructor(private authService: AuthService, private themeService: ThemeService) {
    this.isDarkMode = this.themeService.isDarkMode;
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
  }

  closeSidebar(): void {
    this.close.emit();
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
