import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface OpportunityLocation {
  city: string;
  state: string;
}

export interface OpportunityDuration {
  value: number;
  unit: 'hours' | 'days' | 'weeks' | 'months';
}

export interface OpportunityNgo {
  _id: string;
  name: string;
  email: string;
}

export interface Opportunity {
  _id: string;
  title: string;
  description: string;
  requiredSkills: string[];
  image?: string | null;
  location: OpportunityLocation;
  lat?: number;
  lng?: number;
  sameCity?: boolean;
  distanceKm?: number;
  matchingSkills?: number;
  duration: OpportunityDuration;
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'CANCELLED';
  maxVolunteers: number;
  applicationDeadline: string | null;
  ngo: OpportunityNgo | string;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityQuery {
  search?: string;
  status?: string;
  location?: string;
  skill?: string;
  page?: number;
  limit?: number;
  sort?: 'newest' | 'oldest';
}

@Injectable({
  providedIn: 'root'
})
export class OpportunityService {
  private apiUrl = `${environment.apiUrl}/opportunities`;

  // apiUrl looks like "http://localhost:3000/api/v1" but uploaded images are served
  // from the server root ("http://localhost:3000/uploads/..."), so strip the API suffix.
  private serverRoot = environment.apiUrl.replace(/\/api\/v1\/?$/, '');

  constructor(private http: HttpClient) {}

  /** Resolves a stored image path (e.g. "/uploads/opportunities/x.png") into a full URL. */
  resolveImageUrl(imagePath: string | null | undefined): string | null {
    if (!imagePath) {
      return null;
    }
    if (/^https?:\/\//i.test(imagePath)) {
      return imagePath;
    }
    return `${this.serverRoot}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
  }

  getAll(query: OpportunityQuery = {}): Observable<any> {
    let params = new HttpParams();

    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.http.get(this.apiUrl, { params });
  }

  getById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  create(payload: Partial<Opportunity>): Observable<any> {
    return this.http.post(this.apiUrl, payload);
  }

  update(id: string, payload: Partial<Opportunity>): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, payload);
  }

  changeStatus(id: string, status: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/status`, { status });
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  joinOpportunity(opportunityId: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/applications`, { opportunity: opportunityId });
  }

  withdrawFromOpportunity(opportunityId: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/applications/opportunity/${opportunityId}`);
  }

  getMyApplications(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/applications/mine`);
  }

  getApplicantsForOpportunity(opportunityId: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/applications/opportunity/${opportunityId}`);
  }

  updateApplicationStatus(applicationId: string, status: string): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/applications/${applicationId}/status`, { status });
  }
}
