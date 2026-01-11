import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { NotificationService, Feedback } from '../services/api/notification.service';
import { SessionService } from '../services/api/session.service';

@Component({
  selector: 'app-feedback-panel',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule
  ],
  templateUrl: './feedback-panel.html',
  styleUrls: ['./feedback-panel.scss']
})
export class FeedbackPanelComponent implements OnInit {
  feedbacks: Feedback[] = [];
  loading = true;
  displayedColumns = ['project', 'elementType', 'message', 'status', 'createdAt', 'actions'];

  constructor(
    private notificationService: NotificationService,
    public session: SessionService
  ) {}

  ngOnInit(): void {
    this.loadFeedback();
  }

  loadFeedback(): void {
    this.loading = true;
    this.notificationService.getMyFeedback().subscribe({
      next: (feedbacks) => {
        this.feedbacks = feedbacks;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load feedback:', err);
        this.loading = false;
      }
    });
  }

  getProjectTitle(feedback: Feedback): string {
    if (typeof feedback.project === 'object') {
      return feedback.project.title;
    }
    return 'Unknown Project';
  }

  resolveFeedback(feedback: Feedback): void {
    if (!feedback._id) return;
    this.notificationService.resolveFeedback(feedback._id).subscribe({
      next: () => this.loadFeedback(),
      error: (err) => console.error('Failed to resolve feedback:', err)
    });
  }

  deleteFeedback(feedback: Feedback): void {
    if (!feedback._id) return;
    this.notificationService.deleteFeedback(feedback._id).subscribe({
      next: () => this.loadFeedback(),
      error: (err) => console.error('Failed to delete feedback:', err)
    });
  }

  isArchitect(): boolean {
    return this.session.user()?.role === 'architect';
  }
}
