import { Component, HostListener, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { PersonalInfoComponent } from './personal-info/personal-info';
import { PasswordChangeComponent } from './password-change/password-change';
import { MobileBottomNav } from '../../shared/mobile-bottom-nav/mobile-bottom-nav';
import { AuthService } from '../auth/auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    Sidebar,
    PersonalInfoComponent,
    PasswordChangeComponent,
    MobileBottomNav
  ],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss']
})
export class Profile implements OnInit {

  activeTab: 'profile' | 'password' = 'profile';
  isSidebarOpen = false;
  isDropdownOpen = false;
  
  // Variable to hold the user data
  currentUser: any = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // Fetch the user data when the component loads
    this.currentUser = this.authService.getCurrentUser();

    // Allow deep-linking straight into a tab, e.g. /profile?tab=password
    // (used by the "Change Password" shortcut on the Settings page).
    const requestedTab = this.route.snapshot.queryParamMap.get('tab');
    if (requestedTab === 'password' || requestedTab === 'profile') {
      this.activeTab = requestedTab;
    }
  }

  setActiveTab(tab: 'profile' | 'password'): void {
    this.activeTab = tab;
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

  logout(): void {
    console.log('Logging out...');
    
    // Clear all user and auth data from local storage
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

  onInfoHandoff(event: unknown): void {
    console.log('Personal Info Form Submitted:', event);
  }

  onPasswordHandoff(event: unknown): void {
    console.log('Password Change Form Submitted:', event);
  }
}