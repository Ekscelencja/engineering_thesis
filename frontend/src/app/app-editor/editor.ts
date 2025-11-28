import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditorStateService } from '../services/threejs/editor-state.service';
import { ProjectService, ProjectData } from '../services/api/project.service';
import { ThreeRenderService } from '../services/threejs/three-render.service';
import { RoomWallService } from '../services/threejs/room-wall.service';
import { ProjectIOService } from '../services/api/project-io.service';
import { EditorEventsService } from '../services/threejs/editor-events.service';

@Component({
  selector: 'app-editor',
  standalone: true,
  templateUrl: './editor.html',
  styleUrls: ['./editor.scss'],
  imports: [CommonModule, FormsModule]
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  public projectTitle: string = '';

  constructor(
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private editorStateService: EditorStateService,
    public threeRenderService: ThreeRenderService,
    private roomWallService: RoomWallService,
    private projectService: ProjectService,
    private projectIOService: ProjectIOService,
    public editorEventsService: EditorEventsService
  ) { }

  ngAfterViewInit() {
    this.threeRenderService.init(this.canvasRef.nativeElement);
    this.threeRenderService.animate();
    this.editorEventsService.setCanvasRef(this.canvasRef);

    window.addEventListener('resize', () => this.threeRenderService.resize(this.canvasRef.nativeElement));

    this.ngZone.runOutsideAngular(() => {
      this.editorEventsService.setCanvasListeners();
      window.addEventListener('pointermove', this.editorEventsService.onHandlePointerMove);
      window.addEventListener('pointerup', this.editorEventsService.onHandlePointerUp);
      window.addEventListener('keydown', this.editorEventsService.onKeyDown);
      window.addEventListener('keyup', this.editorEventsService.onKeyUp);
      window.addEventListener('keypress', this.editorEventsService.onKeyPress);
    });
  }

  ngOnDestroy() {
    this.threeRenderService.stopAnimation();
    if (this.threeRenderService.renderer) this.threeRenderService.renderer.dispose();
    this.editorEventsService.deleteCanvasListeners();
    window.removeEventListener('pointermove', this.editorEventsService.onHandlePointerMove);
    window.removeEventListener('pointerup', this.editorEventsService.onHandlePointerUp);
    window.removeEventListener('keydown', this.editorEventsService.onKeyDown);
    window.removeEventListener('keyup', this.editorEventsService.onKeyUp);
    window.removeEventListener('keypress', this.editorEventsService.onKeyPress);
    window.removeEventListener('resize', () => this.threeRenderService.resize(this.canvasRef.nativeElement));
  }

  public saveProjectToServer() {
    const title = this.projectTitle.trim() || 'Untitled Project';
    const project: ProjectData = {
      title,
      globalVertices: this.editorStateService.globalVertices,
      roomVertexIndices: this.editorStateService.roomVertexIndices,
      roomMetadata: this.editorStateService.roomMetadata
    };
    this.projectService.saveProject(project).subscribe({
      next: (saved) => alert('Project saved! ID: ' + saved._id),
      error: (err) => alert('Save failed: ' + err.message)
    });
  }

  public loadProjectFromServer(id: string) {
    this.projectService.loadProject(id).subscribe({
      next: (data) => this.roomWallService.rebuildFromData(data),
      error: (err) => alert('Load failed: ' + err.message)
    });
  }

  public get roomMetadata() {
    return this.editorStateService.roomMetadata;
  }
  public get selectedRoomMesh() {
    return this.editorStateService.selectedRoomMesh;
  }

  public get selectedRoomIndex() {
    return this.editorStateService.selectedRoomIndex;
  }

  public exportProject() {
    this.projectIOService.exportProject();
  }

  public importProject(event: Event) {
    this.projectIOService.importProject(event, (data) => this.roomWallService.rebuildFromData(data));
  }
}