import { CommonModule } from '@angular/common';
import { Component, OnInit, signal, effect } from '@angular/core';
import { EditorComponent } from '../app-editor/editor';
import { ProjectService, ProjectData } from '../services/api/project.service';
import { SessionService } from '../services/api/session.service';
import { AuthService } from '../services/api/auth.service';


@Component({
  selector: 'app-projects-panel',
  standalone: true,
  imports: [EditorComponent, CommonModule],
  templateUrl: './projects-panel.html',
  styleUrls: ['./projects-panel.scss']
})
export class ProjectsPanelComponent implements OnInit {
  projects = signal<ProjectData[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // For create project form
  showCreateForm = signal<boolean>(false);
  newProjectTitle = signal<string>('');
  selectedClientId = signal<string>('');
  clients = signal<{ _id: string; name: string; email: string }[]>([]);
  clientsLoading = signal<boolean>(false);
  createError = signal<string | null>(null);
  creating = signal<boolean>(false);
  showEditorOnly = signal<boolean>(false);
  createdProject: ProjectData | null = null;

  constructor(
    private projectService: ProjectService,
    public session: SessionService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.fetchProjects();
    this.session.loadSession();
  }

  fetchProjects() {
    this.loading.set(true);
    this.projectService.getProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load projects');
        this.loading.set(false);
      }
    });
  }

  createNewProject() {
    this.showCreateForm.set(true);
    this.newProjectTitle.set('');
    this.selectedClientId.set('');
    this.createError.set(null);
    this.fetchClients();
  }

  fetchClients() {
    this.clientsLoading.set(true);
    // Fetch all users, filter for clients (in real app, backend should support ?role=client)
    this.authService["http"].get<any[]>('http://localhost:5000/api/users', {
      headers: { Authorization: `Bearer ${this.session.token()}` }
    }).subscribe({
      next: (users) => {
        this.clients.set(users.filter(u => u.role === 'client'));
        this.clientsLoading.set(false);
      },
      error: () => {
        this.clients.set([]);
        this.clientsLoading.set(false);
      }
    });
  }

  onClientSelect(event: Event) {
    const value = (event.target as HTMLSelectElement)?.value || '';
    this.selectedClientId.set(value);
  }

  submitCreateProject() {
    const title = this.newProjectTitle().trim();
    const clientId = this.selectedClientId();
    if (!title) {
      this.createError.set('Project title is required.');
      return;
    }
    if (!clientId) {
      this.createError.set('Please select a client.');
      return;
    }
    this.creating.set(true);
    this.projectService.saveProject({
      title,
      globalVertices: [],
      roomVertexIndices: [],
      roomMetadata: [],
      clientId
    } as any).subscribe({
      next: (project) => {
        this.createdProject = project;
        this.showCreateForm.set(false);
        this.creating.set(false);
        this.showEditorOnly.set(true);
      },
      error: (err) => {
        this.createError.set('Failed to create project');
        this.creating.set(false);
      }
    });
  }

  cancelCreateProject() {
    this.showCreateForm.set(false);
    this.createError.set(null);
  }

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
