import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Feedback {
  _id?: string;
  project: string | { _id: string; title: string };
  author: string | { _id: string; name: string; email: string };
  targetUser: string | { _id: string; name: string; email: string };
  elementType: 'room' | 'wall' | 'furniture';
  elementId: string;
  position: { x: number; y: number; z: number };
  message: string;
  status: 'pending' | 'resolved';
  resolvedAt?: string;
  resolvedBy?: string | { _id: string; name: string; email: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateFeedbackDto {
  projectId: string;
  elementType: 'room' | 'wall' | 'furniture';
  elementId: string;
  position: { x: number; y: number; z: number };
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private apiUrl = '/api/notifications';

  constructor(private http: HttpClient) {}

  createFeedback(dto: CreateFeedbackDto): Observable<Feedback> {
    return this.http.post<Feedback>(`${this.apiUrl}/feedback`, dto);
  }

  getFeedbackByProject(projectId: string): Observable<Feedback[]> {
    return this.http.get<Feedback[]>(`${this.apiUrl}/feedback/project/${projectId}`);
  }

  getMyFeedback(): Observable<Feedback[]> {
    return this.http.get<Feedback[]>(`${this.apiUrl}/feedback/me`);
  }

  resolveFeedback(id: string): Observable<Feedback> {
    return this.http.patch<Feedback>(`${this.apiUrl}/feedback/${id}/resolve`, {});
  }

  deleteFeedback(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/feedback/${id}`);
  }
}