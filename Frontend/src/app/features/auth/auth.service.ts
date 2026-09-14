import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth`;
  private userApiUrl = `${environment.apiUrl}/users`; 

  constructor(private http: HttpClient) {}

  register(userData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, userData);
  }

  verifyEmail(email: string, otp: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/verify-email`, { email, otp });
  }

  login(credentials: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, credentials);
  }

  // --- Profile Management ---
  getProfile(): Observable<any> {
    return this.http.get(`${this.userApiUrl}/profile`);
  }

  updateProfile(profileData: any): Observable<any> {
    return this.http.put(`${this.userApiUrl}/profile`, profileData);
  }

  deleteAccount(): Observable<any> {
    return this.http.delete(`${this.userApiUrl}/profile`);
  }

  initiatePasswordChange(currentPassword: string): Observable<any> {
    return this.http.post(`${this.userApiUrl}/change-password-init`, { currentPassword });
  }

  confirmPasswordChange(otp: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.userApiUrl}/change-password-confirm`, { otp, newPassword });
  }

  // --- End-to-end encryption key exchange ---
  setPublicKey(publicKey: string): Observable<any> {
    return this.http.put(`${this.userApiUrl}/public-key`, { publicKey });
  }

  getPublicKey(userId: string): Observable<any> {
    return this.http.get(`${this.userApiUrl}/${userId}/public-key`);
  }

  // --- Password-wrapped E2EE private key backup (multi-device recovery) ---
  setKeyBackup(backup: { ciphertext: string; iv: string; salt: string; kdf: any }): Observable<any> {
    return this.http.put(`${this.userApiUrl}/key-backup`, backup);
  }

  getKeyBackup(): Observable<any> {
    return this.http.get(`${this.userApiUrl}/key-backup`);
  }

  setToken(token: string): void {
    localStorage.setItem('wastezero_token', token);
  }

  getToken(): string | null {
    return localStorage.getItem('wastezero_token');
  }

  setUser(user: any): void {
    localStorage.setItem('wastezero_user', JSON.stringify(user));
  }

  getCurrentUser(): any {
    const userStr = localStorage.getItem('wastezero_user');
    if (!userStr) return null;
    
    try {
      return JSON.parse(userStr);
    } catch (e) {
      console.error('Error parsing user data from local storage', e);
      return null;
    }
  }
}