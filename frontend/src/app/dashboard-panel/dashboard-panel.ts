import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule, NgClass, NgFor, DatePipe, TitleCasePipe } from '@angular/common';
import { ProjectService } from '../services/api/project.service';
import { NotificationService } from '../services/api/notification.service';
import { SessionService } from '../services/api/session.service';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-dashboard-panel',
  standalone: true,
  templateUrl: './dashboard-panel.html',
  styleUrls: ['./dashboard-panel.scss'],
  imports: [
    CommonModule,
    NgFor,
    NgClass,
    DatePipe,
    TitleCasePipe,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule
  ]
})
export class DashboardPanelComponent implements OnInit {
  activeProjectsCount = 0;
  archivedProjectsCount = 0;
  pendingFeedbackCount = 0;
  recentFeedback: any[] = [];
  recentProjects: any[] = [];
  userRole: string | null | undefined = null;

  constructor(
    private projectService: ProjectService,
    private notificationService: NotificationService,
    private session: SessionService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    const user = this.session.user();
    const userId = user?.id;
    this.userRole = user?.role;
    
    this.notificationService.getMyFeedback().subscribe(feedback => {
      let filteredFeedback = feedback;
      if (userId && this.userRole) {
        if (this.userRole === 'architect') {
          filteredFeedback = feedback.filter(fb => {
            const targetId = typeof fb.targetUser === 'string' ? fb.targetUser : fb.targetUser?._id;
            return targetId === userId;
          });
        } else if (this.userRole === 'client') {
          filteredFeedback = feedback.filter(fb => {
            const authorId = typeof fb.author === 'string' ? fb.author : fb.author?._id;
            return authorId === userId;
          });
        }
      }
      this.pendingFeedbackCount = filteredFeedback.filter(fb => fb.status === 'pending').length;
      this.recentFeedback = filteredFeedback
        .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
        .slice(0, 5);
      this.cdr.detectChanges();
    });

    this.projectService.getProjects().subscribe((projects: any[]) => {
      let filteredProjects = projects;
      if (this.userRole === 'architect') {
        filteredProjects = projects.filter(p => p.architect?._id === userId);
      } else if (this.userRole === 'client') {
        filteredProjects = projects.filter(p => p.client?._id === userId);
      }
      this.activeProjectsCount = filteredProjects.filter((p: any) => p.status !== 'archived').length;
      this.archivedProjectsCount = filteredProjects.filter((p: any) => p.status === 'archived').length;
      this.recentProjects = filteredProjects
        .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5);
      this.cdr.detectChanges();
    });
  }

  createProject() {
    this.router.navigate(['/projects'], { queryParams: { create: 'true' } });
  }
  goToAssets() {
    this.router.navigate(['/assets']);
  }
  giveFeedback() {
    this.router.navigate(['/feedback']);
  }
  openProject(id: string) {
    this.router.navigate(['/projects'], { queryParams: { edit: id } });
  }
}