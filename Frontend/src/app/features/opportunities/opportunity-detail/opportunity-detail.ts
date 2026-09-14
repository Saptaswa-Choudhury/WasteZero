import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageShell } from '../../../shared/page-shell/page-shell';
import { AuthService } from '../../auth/auth.service';
import { Opportunity, OpportunityService } from '../opportunity.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-opportunity-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, PageShell],
  templateUrl: './opportunity-detail.html',
  styleUrl: './opportunity-detail.scss'
})
export class OpportunityDetail implements OnInit {
  opportunity: Opportunity | null = null;
  isLoading = true;
  errorMessage = '';

  currentUser: any = null;
  canManage = false;

  showDeleteConfirm = false;
  isDeleting = false;

  isVolunteer = false;
  hasApplied = false;
  applicationStatus: string | null = null;
  isJoining = false;
  joinMessage = '';

  applicants: any[] = [];
  isLoadingApplicants = false;
  applicantsError = '';
  reviewingApplicantId = '';

  private opportunityId = '';

  readonly statusLabels: Record<string, string> = {
    OPEN: 'Open',
    IN_PROGRESS: 'In Progress',
    CLOSED: 'Closed',
    CANCELLED: 'Cancelled'
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private opportunityService: OpportunityService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.isVolunteer = this.currentUser?.role === 'volunteer';
    this.opportunityId = this.route.snapshot.paramMap.get('id') || '';
    this.fetchOpportunity();
  }

  private getNgoId(): string | null {
    const ngo = this.opportunity?.ngo as any;
    if (!ngo) return null;
    return typeof ngo === 'string' ? ngo : ngo._id;
  }

  imageUrl(): string | null {
    return this.opportunityService.resolveImageUrl(this.opportunity?.image);
  }

  ngoDisplayName(): string {
    const ngo = this.opportunity?.ngo as any;
    if (!ngo) return 'Unknown';
    return typeof ngo === 'string' ? `NGO ID: ${ngo}` : ngo.name;
  }

  fetchOpportunity(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.opportunityService.getById(this.opportunityId).subscribe({
      next: (response: any) => {
        this.opportunity = response.data?.opportunity || null;
        this.canManage =
          this.currentUser?.role === 'admin' ||
          (this.currentUser?.role === 'ngo' && this.currentUser?.id === this.getNgoId());
        this.isLoading = false;

        if (this.isVolunteer) {
          this.checkApplicationStatus();
        }

        if (this.canManage) {
          this.loadApplicants();
        }
      },
      error: (err: any) => {
        this.errorMessage = err.error?.message || 'Could not load this opportunity.';
        this.isLoading = false;
      }
    });
  }

  loadApplicants(): void {
    this.isLoadingApplicants = true;
    this.applicantsError = '';

    this.opportunityService.getApplicantsForOpportunity(this.opportunityId).subscribe({
      next: (response: any) => {
        this.applicants = response.data?.applications || [];
        this.isLoadingApplicants = false;
      },
      error: (err: any) => {
        this.applicantsError = err.error?.message || 'Could not load applicants.';
        this.isLoadingApplicants = false;
      }
    });
  }

  reviewApplication(applicationId: string, status: 'ACCEPTED' | 'REJECTED'): void {
    this.reviewingApplicantId = applicationId;

    this.opportunityService.updateApplicationStatus(applicationId, status).subscribe({
      next: (response: any) => {
        const updated = response.data?.application;
        const target = this.applicants.find((a) => a._id === applicationId);
        if (target && updated) {
          target.status = updated.status;
        }
        this.reviewingApplicantId = '';
      },
      error: (err: any) => {
        this.applicantsError = err.error?.message || 'Failed to update application status.';
        this.reviewingApplicantId = '';
      }
    });
  }

  checkApplicationStatus(): void {
    this.opportunityService.getMyApplications().subscribe({
      next: (response: any) => {
        const applications = response.data?.applications || [];
        const match = applications.find((app: any) => app.opportunity?._id === this.opportunityId);
        this.hasApplied = !!match && match.status !== 'WITHDRAWN';
        this.applicationStatus = match?.status || null;
      },
      error: () => {
        // Non-critical: if this fails, the Join button just defaults to available.
      }
    });
  }

  joinOpportunity(): void {
    this.isJoining = true;
    this.joinMessage = '';

    this.opportunityService.joinOpportunity(this.opportunityId).subscribe({
      next: () => {
        this.hasApplied = true;
        this.applicationStatus = 'PENDING';
        this.isJoining = false;
      },
      error: (err: any) => {
        this.joinMessage = err.error?.message || 'Failed to join this opportunity.';
        this.isJoining = false;
      }
    });
  }

  withdrawFromOpportunity(): void {
    this.isJoining = true;
    this.joinMessage = '';

    this.opportunityService.withdrawFromOpportunity(this.opportunityId).subscribe({
      next: () => {
        this.hasApplied = false;
        this.applicationStatus = null;
        this.isJoining = false;
      },
      error: (err: any) => {
        this.joinMessage = err.error?.message || 'Failed to withdraw from this opportunity.';
        this.isJoining = false;
      }
    });
  }

  statusLabel(status: string | undefined): string {
    return this.statusLabels[status || ''] || status || '';
  }

  editOpportunity(): void {
    this.router.navigate(['/opportunities', this.opportunityId, 'edit']);
  }

  openDeleteConfirm(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  confirmDelete(): void {
    this.isDeleting = true;

    this.opportunityService.delete(this.opportunityId).subscribe({
      next: () => {
        this.router.navigate(['/opportunities']);
      },
      error: (err: any) => {
        this.errorMessage = err.error?.message || 'Failed to delete this opportunity.';
        this.isDeleting = false;
        this.showDeleteConfirm = false;
      }
    });
  }
}
