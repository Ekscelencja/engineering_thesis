import { Injectable, signal } from '@angular/core';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'architect' | 'client';
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  token = signal<string | null>(localStorage.getItem('token'));
  user = signal<SessionUser | null>(null);

  setSession(token: string, user: any) {
    this.token.set(token);
    const { password, ...safeUser } = user;
    this.user.set(safeUser);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(safeUser));
  }

  clearSession() {
    this.token.set(null);
    this.user.set(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  loadSession() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
      this.token.set(token);
      this.user.set(JSON.parse(user));
    }
  }

  isAuthenticated() {
    return !!this.token();
  }
}
