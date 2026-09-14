import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PageShell } from '../../../shared/page-shell/page-shell';
import { AuthService } from '../../auth/auth.service';
import { Pickup, PickupPartyRef, PickupService } from '../pickup.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-manage-pickups',
  standalone: true,
  imports: [CommonModule, PageShell],
  templateUrl: './manage-pickups.html',
  styleUrl: './manage-pickups.scss'
})
export class ManagePickups implements OnInit {
  activeTab: 'available' | 'accepted' = 'available';

  availablePickups: Pickup[] = [];
  isLoadingAvailable = true;
  availableError = '';

  acceptedPickups: Pickup[] = [];
  isLoadingAccepted = true;
  acceptedError = '';

  actioningId: string | null = null;

  constructor(
    private pickupService: PickupService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.role !== 'ngo') {
      this.router.navigate(['/opportunities']);
      return;
    }

    this.fetchAvailable();
    this.fetchAccepted();
  }

  setActiveTab(tab: 'available' | 'accepted'): void {
    this.activeTab = tab;
  }

  fetchAvailable(): void {
    this.isLoadingAvailable = true;
    this.availableError = '';

    this.pickupService.getAvailable().subscribe({
      next: (response: any) => {
        this.availablePickups = response.data?.pickups || [];
        this.isLoadingAvailable = false;
      },
      error: (err: any) => {
        this.availableError = err.error?.message || 'Could not load available pickups.';
        this.isLoadingAvailable = false;
      }
    });
  }

  fetchAccepted(): void {
    this.isLoadingAccepted = true;
    this.acceptedError = '';

    this.pickupService.getAccepted().subscribe({
      next: (response: any) => {
        this.acceptedPickups = response.data?.pickups || [];
        this.isLoadingAccepted = false;
      },
      error: (err: any) => {
        this.acceptedError = err.error?.message || 'Could not load your accepted pickups.';
        this.isLoadingAccepted = false;
      }
    });
  }

  acceptPickup(pickup: Pickup): void {
    if (this.actioningId) return;
    this.actioningId = pickup._id;

    this.pickupService.accept(pickup._id).subscribe({
      next: () => {
        this.actioningId = null;
        this.availablePickups = this.availablePickups.filter((p) => p._id !== pickup._id);
        this.fetchAccepted();
        this.setActiveTab('accepted');
      },
      error: (err: any) => {
        this.actioningId = null;
        this.availableError = err.error?.message || 'Could not accept this pickup.';
      }
    });
  }

  declinePickup(pickup: Pickup): void {
    if (this.actioningId) return;
    this.actioningId = pickup._id;

    this.pickupService.decline(pickup._id).subscribe({
      next: () => {
        this.actioningId = null;
        this.acceptedPickups = this.acceptedPickups.filter((p) => p._id !== pickup._id);
        this.fetchAvailable();
      },
      error: (err: any) => {
        this.actioningId = null;
        this.acceptedError = err.error?.message || 'Could not decline this pickup.';
      }
    });
  }

  completePickup(pickup: Pickup): void {
    if (this.actioningId) return;
    this.actioningId = pickup._id;

    this.pickupService.complete(pickup._id).subscribe({
      next: (response: any) => {
        this.actioningId = null;
        const updated = response.data?.pickup;
        const idx = this.acceptedPickups.findIndex((p) => p._id === pickup._id);
        if (idx > -1 && updated) {
          this.acceptedPickups[idx] = { ...this.acceptedPickups[idx], ...updated };
        }
      },
      error: (err: any) => {
        this.actioningId = null;
        this.acceptedError = err.error?.message || 'Could not mark this pickup as complete.';
      }
    });
  }

  volunteerName(pickup: Pickup): string {
    const user = pickup.user as PickupPartyRef;
    return typeof user === 'object' ? user.name : 'Volunteer';
  }

  wasteTypeLabel(value: string): string {
    return this.pickupService.wasteTypeLabel(value);
  }

  timeSlotLabel(value: string): string {
    return this.pickupService.timeSlotLabel(value);
  }

  statusClass(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'badge-pending';
      case 'IN_PROGRESS':
        return 'badge-progress';
      case 'COMPLETED':
        return 'badge-completed';
      case 'CANCELLED':
        return 'badge-cancelled';
      default:
        return '';
    }
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'Pending';
      case 'IN_PROGRESS':
        return 'Accepted';
      case 'COMPLETED':
        return 'Completed';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
