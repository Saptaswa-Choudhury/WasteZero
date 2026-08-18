import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PageShell } from '../../shared/page-shell/page-shell';
import { AuthService } from '../auth/auth.service';
import { DashboardService, DashboardStats } from './dashboard.service';
import { PickupService } from '../pickups/pickup.service';
import { Opportunity, OpportunityService } from '../opportunities/opportunity.service';
import { Conversation, MessagesService } from '../messages/messages.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, PageShell],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit {
  currentUser: any = null;

  isLoadingStats = true;
  statsError = '';
  stats: DashboardStats | null = null;

  isLoadingOpportunities = true;
  opportunities: Opportunity[] = [];

  isLoadingMessages = true;
  conversations: Conversation[] = [];

  wasteTypeColors: Record<string, string> = {
    plastic: '#1a73e8',
    paper: '#f9ab00',
    glass: '#34a853',
    metal: '#5f6368',
    electronic: '#d93025',
    organic: '#0f9d58',
    other: '#9334e6'
  };

  constructor(
    private authService: AuthService,
    private dashboardService: DashboardService,
    private pickupService: PickupService,
    private opportunityService: OpportunityService,
    private messagesService: MessagesService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.fetchStats();
    this.fetchOpportunities();
    this.fetchMessages();
  }

  get welcomeSubtitle(): string {
    const name = this.currentUser?.name || 'there';
    return `Welcome back, ${name}! Here's your waste management overview.`;
  }

  fetchStats(): void {
    this.isLoadingStats = true;
    this.statsError = '';

    this.dashboardService.getStats().subscribe({
      next: (response: any) => {
        this.stats = response.data;
        this.isLoadingStats = false;
      },
      error: (err: any) => {
        this.statsError = err.error?.message || 'Could not load your dashboard stats.';
        this.isLoadingStats = false;
      }
    });
  }

  fetchOpportunities(): void {
    this.isLoadingOpportunities = true;
    this.opportunityService.getAll({ status: 'OPEN', sort: 'newest', limit: 3 }).subscribe({
      next: (response: any) => {
        this.opportunities = (response.data?.opportunities || []).slice(0, 3);
        this.isLoadingOpportunities = false;
      },
      error: () => {
        this.opportunities = [];
        this.isLoadingOpportunities = false;
      }
    });
  }

  async fetchMessages(): Promise<void> {
    this.isLoadingMessages = true;
    this.messagesService.getConversations().subscribe({
      next: async (response: any) => {
        const conversations = (response.data?.conversations || []).slice(0, 3);
        this.conversations = await this.messagesService.enrichConversations(conversations);
        this.isLoadingMessages = false;
      },
      error: () => {
        this.conversations = [];
        this.isLoadingMessages = false;
      }
    });
  }

  trendClass(value: number | undefined): string {
    if (!value) return 'flat';
    return value > 0 ? 'up' : 'down';
  }

  trendIcon(value: number | undefined): string {
    if (!value) return 'trending_flat';
    return value > 0 ? 'trending_up' : 'trending_down';
  }

  wasteTypeLabel(value: string): string {
    return this.pickupService.wasteTypeLabel(value);
  }

  wasteTypeColor(value: string): string {
    return this.wasteTypeColors[value] || '#1a73e8';
  }

  imageUrl(opp: Opportunity): string | null {
    return this.opportunityService.resolveImageUrl(opp.image);
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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

  viewOpportunity(id: string): void {
    this.router.navigate(['/opportunities', id]);
  }

  viewAllOpportunities(): void {
    this.router.navigate(['/opportunities']);
  }

  viewAllMessages(): void {
    this.router.navigate(['/messages']);
  }

  viewAllPickups(): void {
    if (this.currentUser?.role === 'ngo') {
      this.router.navigate(['/pickups']);
    } else {
      this.router.navigate(['/schedule']);
    }
  }

  conversationName(conv: Conversation): string {
    return conv.user?.name || 'User';
  }
}
