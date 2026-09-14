import { Component, HostListener, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AppNotification, NotificationsService } from '../notifications.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.scss'
})
export class NotificationBell implements OnInit, OnDestroy {
  isOpen = false;
  unreadCount = 0;

  notifications: AppNotification[] = [];
  isLoading = false;
  hasLoadedOnce = false;

  private destroy$ = new Subject<void>();

  constructor(private notificationsService: NotificationsService, private router: Router) {}

  ngOnInit(): void {
    this.notificationsService.connect();
    this.fetchUnreadCount();

    this.notificationsService.newNotification$.pipe(takeUntil(this.destroy$)).subscribe((notification) => {
      this.notifications = [notification, ...this.notifications];
      this.unreadCount += 1;
    });

    this.notificationsService.unreadCountChange$.pipe(takeUntil(this.destroy$)).subscribe((count) => {
      this.unreadCount = count;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  fetchUnreadCount(): void {
    this.notificationsService.getUnreadCount().subscribe({
      next: (res: any) => (this.unreadCount = res.data?.unreadCount ?? 0),
      error: () => {}
    });
  }

  toggleDropdown(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen && !this.hasLoadedOnce) {
      this.fetchNotifications();
    }
  }

  fetchNotifications(): void {
    this.isLoading = true;
    this.notificationsService.getNotifications().subscribe({
      next: (res: any) => {
        this.notifications = res.data?.notifications || [];
        this.unreadCount = res.data?.unreadCount ?? this.unreadCount;
        this.isLoading = false;
        this.hasLoadedOnce = true;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  onNotificationClick(notification: AppNotification): void {
    if (!notification.isRead) {
      notification.isRead = true;
      this.unreadCount = Math.max(0, this.unreadCount - 1);
      this.notificationsService.markAsRead(notification._id).subscribe({ error: () => {} });
    }

    this.isOpen = false;

    if (notification.link) {
      this.router.navigateByUrl(notification.link);
    }
  }

  markAllAsRead(event: MouseEvent): void {
    event.stopPropagation();
    if (this.unreadCount === 0) return;

    this.notifications = this.notifications.map((n) => ({ ...n, isRead: true }));
    this.unreadCount = 0;
    this.notificationsService.markAllAsRead().subscribe({ error: () => {} });
  }

  iconFor(notification: AppNotification): string {
    switch (notification.type) {
      case 'MESSAGE':
        return 'chat_bubble';
      case 'APPLICATION':
        return 'how_to_reg';
      case 'PICKUP':
        return 'local_shipping';
      default:
        return 'eco';
    }
  }

  timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  trackNotification(_index: number, notification: AppNotification): string {
    return notification._id;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const targetElement = event.target as HTMLElement;
    if (this.isOpen && !targetElement.closest('.notification-bell')) {
      this.isOpen = false;
    }
  }
}
