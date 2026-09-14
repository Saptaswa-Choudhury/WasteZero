import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../features/auth/auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-mobile-bottom-nav',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './mobile-bottom-nav.html',
  styleUrl: './mobile-bottom-nav.scss'
})
export class MobileBottomNav implements OnInit {
  currentUser: any = null;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
  }
}
