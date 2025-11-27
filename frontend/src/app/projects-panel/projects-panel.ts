import { Component } from '@angular/core';
import { EditorComponent } from '../app-editor/editor';

@Component({
  selector: 'app-projects-panel',
  standalone: true,
  imports: [EditorComponent],
  templateUrl: './projects-panel.html',
  styleUrls: ['./projects-panel.scss']
})
export class ProjectsPanelComponent {
  createNewProject() {
    // Logic to create a new project goes here
    console.log('Creating a new project...');
  }
}
