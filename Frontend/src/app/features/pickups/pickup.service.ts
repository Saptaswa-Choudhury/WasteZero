import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type TimeSlot = 'morning' | 'afternoon' | 'evening';
export type WasteType = 'plastic' | 'paper' | 'glass' | 'metal' | 'electronic' | 'organic' | 'other';
export type PickupStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface PickupPartyRef {
  _id: string;
  name: string;
  email: string;
}

export interface Pickup {
  _id: string;
  user: string | PickupPartyRef;
  address: string;
  city: string;
  lat: number;
  lng: number;
  pickupDate: string;
  timeSlot: TimeSlot;
  wasteTypes: WasteType[];
  notes?: string;
  status: PickupStatus;
  ngo?: string | PickupPartyRef | null;
  distanceKm?: number;
  sameCity?: boolean;
  acceptedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePickupPayload {
  address: string;
  city: string;
  lat: number;
  lng: number;
  pickupDate: string;
  timeSlot: TimeSlot;
  wasteTypes: WasteType[];
  notes?: string;
}

export const TIME_SLOT_OPTIONS: { value: TimeSlot; label: string }[] = [
  { value: 'morning', label: 'Morning (8:00 AM - 11:00 AM)' },
  { value: 'afternoon', label: 'Afternoon (12:00 PM - 3:00 PM)' },
  { value: 'evening', label: 'Evening (4:00 PM - 7:00 PM)' }
];

export const WASTE_TYPE_OPTIONS: { value: WasteType; label: string }[] = [
  { value: 'plastic', label: 'Plastic' },
  { value: 'paper', label: 'Paper' },
  { value: 'glass', label: 'Glass' },
  { value: 'metal', label: 'Metal' },
  { value: 'electronic', label: 'Electronic Waste' },
  { value: 'organic', label: 'Organic Waste' },
  { value: 'other', label: 'Other' }
];

@Injectable({
  providedIn: 'root'
})
export class PickupService {
  private apiUrl = `${environment.apiUrl}/pickups`;

  constructor(private http: HttpClient) {}

  create(payload: CreatePickupPayload): Observable<any> {
    return this.http.post(this.apiUrl, payload);
  }

  getMine(): Observable<any> {
    return this.http.get(`${this.apiUrl}/mine`);
  }

  getById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  cancel(id: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/cancel`, {});
  }

  getAvailable(): Observable<any> {
    return this.http.get(`${this.apiUrl}/available`);
  }

  getAccepted(): Observable<any> {
    return this.http.get(`${this.apiUrl}/accepted`);
  }

  accept(id: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/accept`, {});
  }

  decline(id: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/decline`, {});
  }

  complete(id: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/complete`, {});
  }

  timeSlotLabel(value: string): string {
    return TIME_SLOT_OPTIONS.find((t) => t.value === value)?.label || value;
  }

  wasteTypeLabel(value: string): string {
    return WASTE_TYPE_OPTIONS.find((w) => w.value === value)?.label || value;
  }
}
