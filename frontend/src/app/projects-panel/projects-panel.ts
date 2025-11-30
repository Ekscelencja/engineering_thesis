import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CreateProjectDialogComponent } from './create-project-dialog/create-project-dialog.component';
import { EditorComponent } from '../app-editor/editor';
import { ProjectService, ProjectData } from '../services/api/project.service';
import { SessionService } from '../services/api/session.service';
import { AuthService } from '../services/api/auth.service';
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
  createdProject: ProjectData | null = null;
  displayedColumns: string[] = [];
  icons = inject(IconsService);

  constructor(
    private projectService: ProjectService,
    public session: SessionService,
    private authService: AuthService,
    private dialog: MatDialog
  ) { }

  ngOnInit() {
    this.fetchProjects();
    this.session.loadSession();
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
        // Project created, refresh list and show editor
        this.fetchProjects();
        this.showEditorOnly.set(true);
        this.createdProject = result;
      }
    });
  }

  // (create/cancel logic now handled in dialog)

  editProject(project: ProjectData) {
    // Architect: Logic to edit a project
    console.log('Edit project', project);
  }

  archiveProject(project: ProjectData) {
    // Architect: Logic to archive a project
    console.log('Archive project', project);
  }

  deleteProject(project: ProjectData) {
    // Architect: Logic to delete a project
    console.log('Delete project', project);
  }

  viewProject(project: ProjectData) {
    // Client: Logic to view a project
    console.log('View project', project);
  }

  giveFeedback(project: ProjectData) {
    // Client: Logic to give feedback on a project
    console.log('Feedback for project', project);
  }
}
