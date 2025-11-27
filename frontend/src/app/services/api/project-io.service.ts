import { Injectable } from '@angular/core';
import { EditorStateService } from '../threejs/editor-state.service';

@Injectable({ providedIn: 'root' })
export class ProjectIOService {
  constructor(private editorState: EditorStateService) {}

  exportProject() {
    const data = {
      globalVertices: this.editorState.globalVertices,
      roomVertexIndices: this.editorState.roomVertexIndices,
      roomMetadata: this.editorState.roomMetadata
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.json';
    a.click();
    console.log('Exporting project to file:', a.download);
    URL.revokeObjectURL(url);
  }

  importProject(event: Event, rebuildFromData: (data: any) => void) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        rebuildFromData(data);
      } catch (e) {
        alert('Invalid project file.');
      }
    };
    console.log('Importing project from file:', file.name);
    reader.readAsText(file);
  }
}