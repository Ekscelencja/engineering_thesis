import { Component, Inject, inject, signal } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../services/api/project.service';
import { AuthService } from '../../services/api/auth.service';
import { SessionService } from '../../services/api/session.service';

@Component({
  selector: 'app-create-project-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './create-project-dialog.html',
  styleUrls: ['./create-project-dialog.scss']
})
export class CreateProjectDialogComponent {
  newProjectTitle = '';
  selectedClientId = '';
  clients: { _id: string; name: string; email: string }[] = [];
  clientsLoading = false;
  createError: string | null = null;
  creating = false;

  private projectService = inject(ProjectService);
  private authService = inject(AuthService);
  private session = inject(SessionService);
  private dialogRef = inject(MatDialogRef<CreateProjectDialogComponent>);

  ngOnInit() {
    this.fetchClients();
  }

  fetchClients() {
    this.clientsLoading = true;
    this.authService['http'].get<any[]>('http://localhost:5000/api/users', {
      headers: { Authorization: `Bearer ${this.session.token()}` }
    }).subscribe({
      next: (users) => {
        this.clients = users.filter(u => u.role === 'client');
        this.clientsLoading = false;
      },
      error: () => {
        this.clients = [];
        this.clientsLoading = false;
      }
    });
  }

  onCreate() {
    const title = this.newProjectTitle.trim();
    const clientId = this.selectedClientId;
    if (!title) {
      this.createError = 'Project title is required.';
      return;
    }
    if (!clientId) {
      this.createError = 'Please select a client.';
      return;
    }
    this.dialogRef.close({ title, clientId });
  }

  onCancel() {
    this.dialogRef.close();
  }
}
