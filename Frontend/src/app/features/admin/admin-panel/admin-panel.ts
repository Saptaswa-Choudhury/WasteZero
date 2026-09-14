import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PageShell } from '../../../shared/page-shell/page-shell';
import { AuthService } from '../../auth/auth.service';
import { AdminService, AdminStats, AdminUser, AdminLogEntry, ReportType } from '../admin.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-admin-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, PageShell],
  templateUrl: './admin-panel.html',
  styleUrl: './admin-panel.scss'
})
export class AdminPanel implements OnInit {
  currentUser: any = null;

  isLoadingStats = true;
  statsError = '';
  stats: AdminStats | null = null;

  activeTab: 'users' | 'logs' = 'users';

  // --- Manage Users ---
  users: AdminUser[] = [];
  isLoadingUsers = true;
  usersError = '';
  searchTerm = '';
  roleFilter = '';
  private searchDebounce: any = null;

  // --- Admin Logs ---
  logs: AdminLogEntry[] = [];
  isLoadingLogs = true;
  logsError = '';
  logsLoaded = false;

  // --- Reports ---
  downloadingReport: ReportType | null = null;

  // --- Suspend confirm modal ---
  userPendingAction: AdminUser | null = null;
  suspendReason = '';
  isSubmittingSuspension = false;
  suspensionError = '';

  constructor(
    private authService: AuthService,
    private adminService: AdminService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    if (this.currentUser?.role !== 'admin') {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.fetchStats();
    this.fetchUsers();
  }

  fetchStats(): void {
    this.isLoadingStats = true;
    this.statsError = '';

    this.adminService.getStats().subscribe({
      next: (response: any) => {
        this.stats = response.data;
        this.isLoadingStats = false;
      },
      error: (err: any) => {
        this.statsError = err.error?.message || 'Could not load admin stats.';
        this.isLoadingStats = false;
      }
    });
  }

  setActiveTab(tab: 'users' | 'logs'): void {
    this.activeTab = tab;
    if (tab === 'logs' && !this.logsLoaded) {
      this.fetchLogs();
    }
  }

  // --- Manage Users ---

  fetchUsers(): void {
    this.isLoadingUsers = true;
    this.usersError = '';

    this.adminService.getUsers({ q: this.searchTerm, role: this.roleFilter }).subscribe({
      next: (response: any) => {
        this.users = response.data?.users || [];
        this.isLoadingUsers = false;
      },
      error: (err: any) => {
        this.usersError = err.error?.message || 'Could not load users.';
        this.isLoadingUsers = false;
      }
    });
  }

  onSearchChange(): void {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.fetchUsers(), 300);
  }

  onRoleFilterChange(): void {
    this.fetchUsers();
  }

  openSuspendConfirm(user: AdminUser): void {
    this.userPendingAction = user;
    this.suspendReason = '';
    this.suspensionError = '';
  }

  cancelSuspendConfirm(): void {
    this.userPendingAction = null;
    this.suspensionError = '';
  }

  confirmSuspension(): void {
    if (!this.userPendingAction) return;
    const target = this.userPendingAction;
    const nextSuspended = !target.isSuspended;

    this.isSubmittingSuspension = true;
    this.suspensionError = '';

    this.adminService.setUserSuspension(target._id, nextSuspended, this.suspendReason).subscribe({
      next: () => {
        target.isSuspended = nextSuspended;
        this.isSubmittingSuspension = false;
        this.userPendingAction = null;
      },
      error: (err: any) => {
        this.suspensionError = err.error?.message || 'Could not update this user.';
        this.isSubmittingSuspension = false;
      }
    });
  }

  // --- Admin Logs ---

  fetchLogs(): void {
    this.isLoadingLogs = true;
    this.logsError = '';

    this.adminService.getLogs().subscribe({
      next: (response: any) => {
        this.logs = response.data?.logs || [];
        this.isLoadingLogs = false;
        this.logsLoaded = true;
      },
      error: (err: any) => {
        this.logsError = err.error?.message || 'Could not load admin logs.';
        this.isLoadingLogs = false;
      }
    });
  }

  // --- Reports ---

  downloadReport(type: ReportType): void {
    if (this.downloadingReport) return;
    this.downloadingReport = type;

    this.adminService.downloadReport(type).subscribe({
      next: (blob: Blob) => {
        this.adminService.saveBlob(blob, `wastezero-${type}-report.pdf`);
        this.downloadingReport = null;
      },
      error: () => {
        this.downloadingReport = null;
      }
    });
  }

  // --- Helpers ---

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatDateTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  roleLabel(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  logSummary(log: AdminLogEntry): string {
    const target = log.targetType.charAt(0) + log.targetType.slice(1).toLowerCase();
    return `${log.action} ${target}`;
  }
}
