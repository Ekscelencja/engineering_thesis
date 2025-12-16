
import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, NgZone, ChangeDetectorRef, Input, SimpleChanges, Output, EventEmitter, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditorStateService } from '../services/threejs/editor-state.service';
import { ProjectService, ProjectData } from '../services/api/project.service';
import { ThreeRenderService } from '../services/threejs/three-render.service';
import { RoomWallService } from '../services/threejs/room-wall.service';
import { ProjectIOService } from '../services/api/project-io.service';
import { EditorEventsService } from '../services/threejs/editor-events.service';
import { MatButtonModule } from '@angular/material/button';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { StepperSelectionEvent } from '@angular/cdk/stepper';
import { MatTableModule } from '@angular/material/table';
import { ColorPickerComponent } from './color-picker/color-picker';
import { AssetsService, FurnitureAsset } from '../services/api/assets.service';

@Pipe({ name: 'numberToColor' })
export class NumberToColorPipe implements PipeTransform {
  transform(value: number): string {
    if (typeof value !== 'number') return '#000000';
    return '#' + value.toString(16).padStart(6, '0');
  }
}

@Component({
  selector: 'app-editor',
  standalone: true,
  templateUrl: './editor.html',
  styleUrls: ['./editor.scss'],
  imports: [CommonModule, FormsModule, MatButtonModule, MatStepperModule, MatInputModule, MatIconModule, MatTableModule, NumberToColorPipe, ColorPickerComponent]
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  // --- Sofa Placement Proof-of-Concept ---
  protected sofaModel: THREE.Group | null = null;
  public isPlacingSofa: boolean = false;
  public wallColor: string = '#cccccc';
  public wallTexture: string = '';
  public floorColor: string = '#888888';
  public floorTexture: string = '';
  public wallTextureTileSizeM = 1;
  public furnitureAssets: FurnitureAsset[] = [];

  wallFeatureRows = [
    { type: 'features', label: 'Wall Features', expanded: false },
    { type: 'wcolor', label: 'Wall Color', expanded: false },
    { type: 'wtexture', label: 'Wall Texture', expanded: false },
    { type: 'fcolor', label: 'Floor Color', expanded: false },
    { type: 'ftexture', label: 'Floor Texture', expanded: false }
  ];

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('stepper') stepperRef?: MatStepper;

  actionPanelExpanded: boolean = true;
  isNewProject: boolean = false;
  clientId: string | null = null;
  projectTitle: string | null = null;
  @Input() userType: string | null = null;
  @Input() projectId: string | null = null;
  @Input() newProjectClientId: string | null = null;
  @Input() newProjectTitle: string | null = null;
  @Input() projectData: Partial<ProjectData> | null = null;
  @Output() closeEditor = new EventEmitter<void>();

  public get roomMetadata() {
    return this.editorStateService.roomMetadata;
  }
  public get selectedRoomMesh() {
    return this.editorStateService.selectedRoomMesh;
  }

  public get selectedRoomIndex() {
    return this.editorStateService.selectedRoomIndex;
  }

  public get editorStep() {
    return this.editorStateService.editorStep;
  }

  constructor(
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    protected editorStateService: EditorStateService,
    public threeRenderService: ThreeRenderService,
    private roomWallService: RoomWallService,
    private projectService: ProjectService,
    //private projectIOService: ProjectIOService,
    public editorEventsService: EditorEventsService,
    private assetsService: AssetsService
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

  ngOnChanges(changes: SimpleChanges) {
    if (changes['projectId'] && this.projectId) {
      this.projectService.loadProject(this.projectId).subscribe({
        next: (data) => {
          this.isNewProject = false;
          this.editorStateService.editorStep = data.editorStep || 1;
          this.roomWallService.rebuildFromData(data);
          this.projectTitle = data.title;
          this.clientId = data.client;
          setTimeout(() => {
            if (this.stepperRef) {
              this.stepperRef.selectedIndex = this.editorStateService.editorStep - 1;
            }
            this.cdr.detectChanges();
          });
        },
        error: (err) => alert('Load failed: ' + err.message)
      });
    }
    if (changes['newProjectTitle'] && this.newProjectTitle && this.newProjectClientId) {
      this.isNewProject = true;
      console.log('Creating new project with title:', this.newProjectTitle, 'and clientId:', this.newProjectClientId);
    }
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
    const project: ProjectData = {
      title: this.isNewProject ? this.newProjectTitle! : this.projectTitle!,
      client: this.isNewProject ? this.newProjectClientId! : this.clientId!,
      globalVertices: this.editorStateService.globalVertices,
      roomVertexIndices: this.editorStateService.roomVertexIndices,
      roomMetadata: this.editorStateService.roomMetadata,
      wallAppearance: this.editorStateService.wallAppearance,
      floorAppearance: this.editorStateService.floorAppearance,
      editorStep: this.editorStateService.editorStep
    };
    if (this.isNewProject) {
      this.projectService.saveProject(project).subscribe({
        next: (saved) => (alert('Project saved! ID: ' + saved._id),
          this.projectId = saved._id!,
          this.clientId = saved.client!,
          this.projectTitle = saved.title,
          this.isNewProject = false
        ),
        error: (err) => alert('Save failed: ' + err.message)
      });
    } else {
      this.projectService.updateProject(this.projectId!, project).subscribe({
        next: (updated) => alert('Project updated! ID: ' + updated._id),
        error: (err) => alert('Update failed: ' + err.message)
      });
    }
  }

  public exitEditor() {
    this.closeEditor.emit();
  }

  onStepperSelectionChange(event: StepperSelectionEvent) {
    const newStep = event.selectedIndex + 1;
    if (this.editorStep !== newStep) {
      this.editorStateService.editorStep = newStep as 1 | 2 | 3;
      if (newStep === 1) {
        this.roomWallService.hideAllWalls();
      } else {
        this.roomWallService.regenerateAllWalls();
      }
      if (newStep === 3) {
        this.assetsService.getFurnitureAssets().subscribe(assets => {
          this.furnitureAssets = assets;
          this.cdr.detectChanges();
        });
      }
    }
  }

  startPlacingFeature(type: 'window' | 'door') {
    this.editorStateService.placingFeatureType = type;
    this.editorEventsService.initFeaturePreview();
  }

  placeSofa() {
    this.isPlacingSofa = true;

    const mtlLoader = new MTLLoader();
    mtlLoader.setPath('assets/3d_objects/sofa_1/');
    mtlLoader.load('couch.mtl', (materials) => {
      materials.preload();
      const objLoader = new OBJLoader();
      objLoader.setMaterials(materials);
      objLoader.setPath('assets/3d_objects/sofa_1/');
      objLoader.load('couch.obj', (object) => {
        object.scale.set(0.01, 0.01, 0.01); // Adjust scale as needed
        object.position.set(0, 0, 0);
        this.threeRenderService.scene.add(object);
        this.sofaModel = object;
        console.log('Sofa loaded successfully');
      }, undefined, (error) => {
        console.error('Error loading OBJ:', error);
      });
    }, undefined, (error) => {
      console.error('Error loading MTL:', error);
    });
  }

  removeSofa() {
    if (this.sofaModel) {
      this.threeRenderService.scene.remove(this.sofaModel);
      this.sofaModel = null;
      this.isPlacingSofa = false;
    }
  }

  onCanvasClick(event: MouseEvent) {
    if (this.isPlacingSofa && this.sofaModel) {
      // Raycast to find position on floor
      const canvas = this.canvasRef.nativeElement;
      const mouse = new THREE.Vector2(
        (event.offsetX / canvas.width) * 2 - 1,
        -(event.offsetY / canvas.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, this.threeRenderService.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersection = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, intersection);
      if (intersection) {
        this.sofaModel.position.set(intersection.x, 0, intersection.z);
      }
      this.isPlacingSofa = false;
      return;
    }
    this.editorEventsService.handleWallClick(event);
  }

  onWallColorPicked(ev: { hex: string; num: number }) {
    this.wallColor = ev.hex;
    console.log('Wall color picked:', this.wallColor);
    this.applyWallColor();
  }

  applyWallColor() {
    const wall = this.editorStateService.selectedWall;
    const side = this.editorStateService.selectedWallSide;
    if (!wall || !side) return;
    this.roomWallService.applyWallColorToMesh(wall, this.wallColor, side);
  }

  applyWallTexture() {
    const wall = this.editorStateService.selectedWall;
    const side = this.editorStateService.selectedWallSide;
    if (!wall || !side) return;
    this.roomWallService.applyWallTextureToMesh(wall, this.wallTexture || null, side);
  }

  onFloorColorPicked(ev: { hex: string; num: number }) {
    this.floorColor = ev.hex;
    this.applyFloorColor();
  }

  applyFloorColor() {
    const idx = this.selectedRoomIndex;
    if (idx < 0) return;
    const mesh = this.editorStateService.roomMeshes[idx];
    const roomKey = idx.toString();
    this.roomWallService.applyFloorColorToMesh(mesh, this.floorColor, roomKey);
  }

  applyFloorTexture() {
    const idx = this.selectedRoomIndex;
    if (idx < 0) return;
    const mesh = this.editorStateService.roomMeshes[idx];
    const roomKey = idx.toString();
    this.roomWallService.applyFloorTextureToMesh(mesh, this.floorTexture || null, roomKey);
  }
}