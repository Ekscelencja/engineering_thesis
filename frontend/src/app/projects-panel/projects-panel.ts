import { Component } from '@angular/core';
import { ThreeCanvasComponent } from '../three-canvas/three-canvas';

@Component({
  selector: 'app-projects-panel',
  standalone: true,
  imports: [ThreeCanvasComponent],
  templateUrl: './projects-panel.html',
  styleUrls: ['./projects-panel.scss']
})
export class ProjectsPanelComponent {
  createNewProject() {
    // Logic to create a new project goes here
    console.log('Creating a new project...');
  }
}
