import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PageShell } from '../../../shared/page-shell/page-shell';
import { AuthService } from '../../auth/auth.service';
import { Opportunity, OpportunityService } from '../opportunity.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-opportunities-list',
  standalone: true,
  imports: [CommonModule, FormsModule, PageShell],
  templateUrl: './opportunities-list.html',
  styleUrl: './opportunities-list.scss'
})
export class OpportunitiesList implements OnInit, OnDestroy {
  opportunities: Opportunity[] = [];
  isLoading = true;
  errorMessage = '';

  searchTerm = '';
  statusFilter = '';
  locationFilter = '';

  currentUser: any = null;
  canCreate = false;

  private searchDebounce: ReturnType<typeof setTimeout> | undefined;

  readonly statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'CLOSED', label: 'Closed' },
    { value: 'CANCELLED', label: 'Cancelled' }
  ];

  constructor(
    private opportunityService: OpportunityService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.canCreate = this.currentUser?.role === 'ngo' || this.currentUser?.role === 'admin';
    this.fetchOpportunities();
  }

  ngOnDestroy(): void {
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
  }

  fetchOpportunities(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.opportunityService
      .getAll({ search: this.searchTerm, status: this.statusFilter, location: this.locationFilter })
      .subscribe({
        next: (response: any) => {
          this.opportunities = response.data?.opportunities || [];
          this.isLoading = false;
        },
        error: (err: any) => {
          this.errorMessage = err.error?.message || 'Could not load opportunities.';
          this.isLoading = false;
        }
      });
  }

  onSearchChange(): void {
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
    this.searchDebounce = setTimeout(() => this.fetchOpportunities(), 350);
  }

  onStatusFilterChange(): void {
    this.fetchOpportunities();
  }

  onLocationFilterChange(): void {
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
    this.searchDebounce = setTimeout(() => this.fetchOpportunities(), 350);
  }

  clearLocationFilter(): void {
    this.locationFilter = '';
    this.fetchOpportunities();
  }

  createOpportunity(): void {
    this.router.navigate(['/opportunities/new']);
  }

  viewDetails(id: string): void {
    this.router.navigate(['/opportunities', id]);
  }

  imageUrl(opp: Opportunity): string | null {
    return this.opportunityService.resolveImageUrl(opp.image);
  }

  isOwn(opp: Opportunity): boolean {
    if (this.currentUser?.role !== 'ngo') {
      return false;
    }
    const ngoId = typeof opp.ngo === 'object' ? opp.ngo?._id : opp.ngo;
    return ngoId === this.currentUser?._id;
  }

  statusLabel(status: string): string {
    return this.statusOptions.find((s) => s.value === status)?.label || status;
  }

  statusClass(status: string): string {
    switch (status) {
      case 'OPEN':
        return 'badge-open';
      case 'IN_PROGRESS':
        return 'badge-progress';
      case 'CLOSED':
        return 'badge-closed';
      case 'CANCELLED':
        return 'badge-cancelled';
      default:
        return '';
    }
  }
}
