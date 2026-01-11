import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal, TemplateRef, ViewChild } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CreateProjectDialogComponent } from './create-project-dialog/create-project-dialog.component';
import { EditorComponent } from '../app-editor/editor';
import { ProjectService, ProjectData } from '../services/api/project.service';
import { SessionService } from '../services/api/session.service';
import { IconsService } from '../services/icons.service';


@Component({
  selector: 'app-projects-panel',
  standalone: true,
  imports: [
    EditorComponent,
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDialogModule,
    CreateProjectDialogComponent
  ],
  templateUrl: './projects-panel.html',
  styleUrls: ['./projects-panel.scss']
})
export class ProjectsPanelComponent implements OnInit {
  projects = signal<ProjectData[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Dialog-related state removed (handled in dialog)
  showEditorOnly = signal<boolean>(false);
  displayedColumns: string[] = [];
  icons = inject(IconsService);
  selectedProjectId: string | null = null;
  newProjectTitle: string | null = null;
  newProjectClientId: string | null = null;
  userType: string | null = null;
  feedbackMode: boolean = false;

  @ViewChild('editorRef') editorRef?: EditorComponent;
  @ViewChild('confirmDialog') confirmDialogTpl!: TemplateRef<any>;

  public confirmDialogRef: MatDialogRef<any> | null = null;
  confirmDialogData: { title: string; question: string; confirmText: string; color: string; onConfirm: () => void } | null = null;

  constructor(
    private projectService: ProjectService,
    public session: SessionService,
    private dialog: MatDialog
  ) { }

  ngOnInit() {
    this.session.loadSession();
    this.userType = this.session.user()?.role || null;
    this.fetchProjects();
    this.setDisplayedColumns();
  }

  setDisplayedColumns() {
    if (this.session.user()?.role === 'architect') {
      this.displayedColumns = ['title', 'id', 'client', 'actions'];
    } else {
      this.displayedColumns = ['title', 'id', 'actions'];
    }
  }

  fetchProjects() {
    this.loading.set(true);
    this.projectService.getProjects().subscribe({
      next: (projects) => {
        // Add clientName for table if available
        const projectsWithClient = projects.map((p: any) => ({
          ...p,
          clientName: p.client?.name || p.clientName || ''
        }));
        console.log('Fetched projects', projectsWithClient);
        this.projects.set(projectsWithClient);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load projects');
        this.loading.set(false);
      }
    });

  }

  openCreateProjectDialog() {
    const dialogRef = this.dialog.open(CreateProjectDialogComponent, {
      width: '400px',
      disableClose: true
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.newProjectTitle = result.title;
        this.newProjectClientId = result.clientId;
        this.showEditorOnly.set(true);
      }
    });
  }

  // (create/cancel logic now handled in dialog)
  editProject(project: ProjectData) {
    this.selectedProjectId = project._id || null;
    this.showEditorOnly.set(true);
  }

  archiveProject(project: ProjectData) {
    this.confirmDialogData = {
      title: 'Archive Project',
      question: `Are you sure you want to archive "${project.title}"?`,
      confirmText: 'Archive',
      color: 'accent',
      onConfirm: () => {
        this.loading.set(true);
        this.projectService.archiveProject(project._id!).subscribe({
          next: () => {
            this.fetchProjects();
            this.loading.set(false);
          },
          error: () => {
            this.error.set('Failed to archive project');
            this.loading.set(false);
          }
        });
      }
    };
    this.confirmDialogRef = this.dialog.open(this.confirmDialogTpl);
    this.confirmDialogRef.afterClosed().subscribe((result: any) => {
      if (result === true && this.confirmDialogData) {
        this.confirmDialogData.onConfirm();
      }
      this.confirmDialogData = null;
      this.confirmDialogRef = null;
    });
  }

  deleteProject(project: ProjectData) {
    this.confirmDialogData = {
      title: 'Delete Project',
      question: `Are you sure you want to delete "${project.title}"? This action cannot be undone!`,
      confirmText: 'Delete',
      color: 'warn',
      onConfirm: () => {
        this.loading.set(true);
        this.projectService.deleteProject(project._id!).subscribe({
          next: () => {
            this.fetchProjects();
            this.loading.set(false);
          },
          error: () => {
            this.error.set('Failed to delete project');
            this.loading.set(false);
          }
        });
      }
    };
    this.confirmDialogRef = this.dialog.open(this.confirmDialogTpl);
    this.confirmDialogRef.afterClosed().subscribe((result: any) => {
      if (result === true && this.confirmDialogData) {
        this.confirmDialogData.onConfirm();
      }
      this.confirmDialogData = null;
      this.confirmDialogRef = null;
    });
  }

  // Update viewProject method
  viewProject(project: ProjectData) {
    this.selectedProjectId = project._id || null;
    this.feedbackMode = false;
    this.showEditorOnly.set(true);
  }

  // Update giveFeedback method
  giveFeedback(project: ProjectData) {
    this.selectedProjectId = project._id || null;
    this.feedbackMode = true;
    this.showEditorOnly.set(true);
  }

  // Add method to close editor and reset state
  closeEditor() {
    this.showEditorOnly.set(false);
    this.feedbackMode = false;
    this.selectedProjectId = null;
    this.newProjectTitle = null;
    this.newProjectClientId = null;
    this.fetchProjects();
  }
}
