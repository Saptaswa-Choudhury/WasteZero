import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AdminStats {
  totalUsers: number;
  completedPickups: number;
  pendingPickups: number;
  activeOpportunities: number;
}

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  isSuspended: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  city?: { name: string | null };
}

export interface AdminLogEntry {
  _id: string;
  admin: { _id: string; name: string; email: string } | null;
  action: string;
  targetType: string;
  targetId: string;
  details: any;
  createdAt: string;
}

export type ReportType = 'users' | 'pickups' | 'opportunities' | 'full';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private apiUrl = `${environment.apiUrl}/admin`;

  constructor(private http: HttpClient) {}

  getStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/stats`);
  }

  getUsers(params: { q?: string; role?: string; status?: string; page?: number; limit?: number } = {}): Observable<any> {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    });
    return this.http.get(`${this.apiUrl}/users`, { params: httpParams });
  }

  setUserSuspension(userId: string, suspend: boolean, reason = ''): Observable<any> {
    return this.http.patch(`${this.apiUrl}/users/${userId}/suspend`, { suspend, reason });
  }

  getLogs(page = 1, limit = 20): Observable<any> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http.get(`${this.apiUrl}/logs`, { params });
  }

  removeOpportunity(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/opportunities/${id}`);
  }

  /** Downloads a PDF report and returns it as a Blob for the caller to save. */
  downloadReport(type: ReportType): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/reports/${type}`, { responseType: 'blob' });
  }

  /** Triggers a browser file-save for a blob returned by downloadReport(). */
  saveBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}
