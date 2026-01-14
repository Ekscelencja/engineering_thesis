import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule, NgClass, NgFor, DatePipe, TitleCasePipe } from '@angular/common';
import { ProjectService } from '../services/api/project.service';
import { NotificationService } from '../services/api/notification.service';
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

  constructor(
    private projectService: ProjectService,
    private notificationService: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.projectService.getProjects().subscribe((projects: any[]) => {
      this.activeProjectsCount = projects.filter((p: any) => p.status !== 'archived').length;
      this.archivedProjectsCount = projects.filter((p: any) => p.status === 'archived').length;
      this.recentProjects = projects
        .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5);
      this.cdr.detectChanges();
      console.log('Recent projects:', this.recentProjects);
    });
    this.notificationService.getMyFeedback().subscribe(feedback => {
      this.pendingFeedbackCount = feedback.filter(fb => fb.status === 'pending').length;
      this.recentFeedback = feedback
        .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
        .slice(0, 5);
      this.cdr.detectChanges();
      console.log('Recent feedback:', this.recentFeedback);
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