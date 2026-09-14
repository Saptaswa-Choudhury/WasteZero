import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../features/auth/auth.service';

export type NotificationType = 'MESSAGE' | 'OPPORTUNITY' | 'PICKUP' | 'APPLICATION';

export interface AppNotification {
  _id: string;
  recipient: string;
  sender?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  relatedId?: string | null;
  isRead: boolean;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {
  private apiUrl = `${environment.apiUrl}/notifications`;

  // Socket.IO connects to the server root (not /api/v1), same as MessagesService.
  private socketUrl = environment.apiUrl.replace(/\/api\/v1\/?$/, '');
  private socket: Socket | null = null;

  newNotification$ = new Subject<AppNotification>();
  unreadCountChange$ = new Subject<number>();

  constructor(private http: HttpClient, private authService: AuthService) {}

  // Called once from the page shell (present on every authenticated page) so
  // the badge/dropdown stay live no matter which feature page is open.
  connect(): void {
    if (this.socket?.connected) return;

    const token = this.authService.getToken();
    if (!token) return;

    this.socket = io(this.socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('notification:new', (notification: AppNotification) =>
      this.newNotification$.next(notification)
    );

    this.socket.on('notification:unreadCount', (payload: { unreadCount: number }) =>
      this.unreadCountChange$.next(payload.unreadCount)
    );
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  getNotifications(page = 1, limit = 20): Observable<any> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http.get(`${this.apiUrl}`, { params });
  }

  getUnreadCount(): Observable<any> {
    return this.http.get(`${this.apiUrl}/unread-count`);
  }

  markAsRead(id: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/read`, {});
  }

  markAllAsRead(): Observable<any> {
    return this.http.patch(`${this.apiUrl}/read-all`, {});
  }
}
