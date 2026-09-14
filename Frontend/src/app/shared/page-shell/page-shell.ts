import { Component, HostListener, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Sidebar } from '../sidebar/sidebar';
import { MobileBottomNav } from '../mobile-bottom-nav/mobile-bottom-nav';
import { NotificationBell } from '../notifications/notification-bell/notification-bell';
import { AuthService } from '../../features/auth/auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-page-shell',
  standalone: true,
  imports: [CommonModule, Sidebar, MobileBottomNav, NotificationBell],
  templateUrl: './page-shell.html',
  styleUrl: './page-shell.scss'
})
export class PageShell implements OnInit {
  @Input() title = '';
  @Input() subtitle = '';

  isSidebarOpen = false;
  isDropdownOpen = false;
  currentUser: any = null;

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  goToProfile(): void {
    this.isDropdownOpen = false;
    this.router.navigate(['/profile']);
  }

  logout(): void {
    localStorage.removeItem('wastezero_token');
    localStorage.removeItem('wastezero_user');
    this.router.navigate(['/auth']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const targetElement = event.target as HTMLElement;
    if (this.isDropdownOpen && !targetElement.closest('.user-dropdown')) {
      this.isDropdownOpen = false;
    }
  }
}
