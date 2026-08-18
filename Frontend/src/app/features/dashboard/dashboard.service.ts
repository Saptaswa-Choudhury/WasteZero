import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RecyclingBreakdownEntry {
  category: string;
  percent: number;
}

export interface DashboardTrends {
  totalPickups: number;
  recycledItems: number;
  co2SavedKg: number;
  volunteerHours: number;
}

export interface DashboardStats {
  totalPickups: number;
  completedPickups: number;
  recycledItems: number;
  co2SavedKg: number;
  volunteerHours: number;
  totalCollectedKg: number;
  recyclingBreakdown: RecyclingBreakdownEntry[];
  recyclingBreakdownIsAllTime: boolean;
  upcomingPickups: any[];
  trends: DashboardTrends;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private apiUrl = `${environment.apiUrl}/dashboard`;

  constructor(private http: HttpClient) {}

  getStats(): Observable<any> {
    return this.http.get(this.apiUrl);
  }
}
