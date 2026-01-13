import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, NgZone, ChangeDetectorRef, Input, SimpleChanges, Output, EventEmitter, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditorStateService } from '../services/threejs/editor-state.service';
import { ProjectService, ProjectData } from '../services/api/project.service';
import { ThreeRenderService } from '../services/threejs/three-render.service';
import { RoomWallService } from '../services/threejs/room-wall.service';
import { EditorEventsService } from '../services/threejs/editor-events.service';
import { MatButtonModule } from '@angular/material/button';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { FeedbackDialogComponent, FeedbackDialogData } from '../feedback/feedback-dialog/feedback-dialog';
import { FeedbackViewDialogComponent } from '../feedback/feedback-view-dialog/feedback-view-dialog';
import { NotificationService, Feedback } from '../services/api/notification.service';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { StepperSelectionEvent } from '@angular/cdk/stepper';
import { ColorPickerComponent } from './color-picker/color-picker';
import { AssetsService, FurnitureAsset } from '../services/api/assets.service';
import { FurniturePreviewComponent } from '../furniture-preview/furniture-preview';

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
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatStepperModule,
    MatInputModule,
    MatIconModule,
    MatTableModule,
    MatSelectModule,
    NumberToColorPipe,
    ColorPickerComponent,
    FurniturePreviewComponent
  ]
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  public wallColor: string = '';
  public wallTexture: string = '';
  public floorColor: string = '';
  public floorTexture: string = '';
  public furnitureAssets: FurnitureAsset[] = [];
  public placedFurniture: { asset: FurnitureAsset, position: THREE.Vector3, rotation: number }[] = [];

  wallFeatureRows = [
    { type: 'features', label: 'Wall Features', expanded: false },
    { type: 'wcolor', label: 'Wall Color', expanded: false },
    { type: 'wtexture', label: 'Wall Texture', expanded: false },
    { type: 'fcolor', label: 'Floor Color', expanded: false },
    { type: 'ftexture', label: 'Floor Texture', expanded: false }
  ];

  roomTypes = [
    { key: 'living_room', label: 'Living Room' },
    { key: 'bedroom', label: 'Bedroom' },
    { key: 'bathroom', label: 'Bathroom' },
    { key: 'kitchen', label: 'Kitchen' },
    { key: 'hall', label: 'Hall' },
    { key: 'corridor', label: 'Corridor' },
    { key: 'dining_room', label: 'Dining Room' },
    { key: 'office', label: 'Office' },
    { key: 'study', label: 'Study' },
    { key: 'storage', label: 'Storage' },
    { key: 'utility_room', label: 'Utility Room' },
    { key: 'laundry_room', label: 'Laundry Room' },
    { key: 'closet', label: 'Closet' },
    { key: 'walk_in_closet', label: 'Walk-in Closet' }
  ];

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('stepper') stepperRef?: MatStepper;

  actionPanelExpanded: boolean = true;
  isNewProject: boolean = true;
  clientId: string | null = null;
  projectTitle: string | null = null;
  @Input() userType: string | null = null;
  @Input() projectId: string | null = null;
  @Input() newProjectClientId: string | null = null;
  @Input() newProjectTitle: string | null = null;
  @Input() projectData: Partial<ProjectData> | null = null;
  @Output() closeEditor = new EventEmitter<void>();

  // Add these new inputs
  @Input() feedbackMode: boolean = false;
  @Input() viewOnly: boolean = false;

  // Add feedback-related properties
  private feedbackMarkers: THREE.Mesh[] = [];
  private feedbackData: Feedback[] = [];

  private suppressStepperSelectionChange = false;

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

  public get canEdit(): boolean {
    return !this.viewOnly && !this.feedbackMode;
  }

  public step1Completed = false;
  public step2Completed = false;

  private applyCompletionFromStep(step: 1 | 2 | 3) {
    this.step1Completed = step >= 2;
    this.step2Completed = step >= 3;
  }

  constructor(
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    protected editorStateService: EditorStateService,
    public threeRenderService: ThreeRenderService,
    private roomWallService: RoomWallService,
    private projectService: ProjectService,
    public editorEventsService: EditorEventsService,
    private assetsService: AssetsService,
    private dialog: MatDialog,  // Add this
    private notificationService: NotificationService  // Add this
  ) { }

  ngAfterViewInit() {
    this.threeRenderService.init(this.canvasRef.nativeElement);
    this.threeRenderService.animate();
    this.editorEventsService.setCanvasRef(this.canvasRef);

    // Pass feedback mode and view-only state to services
    this.editorStateService.feedbackMode = this.feedbackMode;
    this.editorEventsService.viewOnly = this.viewOnly;
    this.editorEventsService.feedbackMode = this.feedbackMode;

    // Set up feedback element selection handler (only for feedback mode - client leaving feedback)
    if (this.feedbackMode) {
      this.editorEventsService.onFeedbackElementSelected = this.onElementSelectedForFeedback.bind(this);
    }

    // ALWAYS set up feedback marker click handler (for both architect and client to view feedback)
    this.editorEventsService.onFeedbackMarkerClicked = this.onFeedbackMarkerClicked.bind(this);

    window.addEventListener('resize', () => this.threeRenderService.resize(this.canvasRef.nativeElement));

    this.ngZone.runOutsideAngular(() => {
      this.editorEventsService.setCanvasListeners();
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['projectId'] && this.projectId) {
      this.projectService.loadProject(this.projectId).subscribe({
        next: (data) => {
          this.isNewProject = false;
          this.projectTitle = data.title;
          this.clientId = data.client;

          const step = ((data.editorStep || 1) as 1 | 2 | 3);
          this.editorStateService.editorStep = step;

          this.roomWallService.rebuildFromData(data);

          this.applyCompletionFromStep(step);
          this.cdr.detectChanges();

          setTimeout(() => {
            if (this.stepperRef) {
              this.stepperRef.selectedIndex = step - 1;
              this.cdr.detectChanges();
            }
          }, 0);

          if (step === 3) {
            this.assetsService.getFurnitureAssets().subscribe(assets => {
              this.furnitureAssets = assets;
              this.cdr.detectChanges();
              this.hydratePlacedFurnitureFromProject(data);
            });
          } else {
            this.hydratePlacedFurnitureFromProject(data);
          }

          // Load feedback markers after project loads
          this.loadFeedbackMarkers();
        },
        error: (err) => alert('Load failed: ' + err.message)
      });
    }

    // Update feedback mode state when input changes
    if (changes['feedbackMode']) {
      this.editorStateService.feedbackMode = this.feedbackMode;
      if (this.editorEventsService) {
        this.editorEventsService.feedbackMode = this.feedbackMode;
      }
    }

    if (changes['viewOnly']) {
      if (this.editorEventsService) {
        this.editorEventsService.viewOnly = this.viewOnly;
      }
    }
  }

  ngOnDestroy() {
    this.threeRenderService.stopAnimation();
    if (this.threeRenderService.renderer) this.threeRenderService.renderer.dispose();
    this.editorEventsService.deleteCanvasListeners();
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
      furniture: this.editorStateService.placedFurnitures.map(f => ({
        assetId: f.asset.folder,
        position: { x: f.position.x, y: f.position.y, z: f.position.z },
        rotation: f.rotation
      })),
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

  public goToStep(step: 1 | 2 | 3): void {
    this.editorStateService.editorStep = step;

    if (step === 1) this.roomWallService.hideAllWalls();
    else this.roomWallService.regenerateAllWalls();

    if (step === 3 && this.furnitureAssets.length === 0) {
      this.assetsService.getFurnitureAssets().subscribe(assets => {
        this.furnitureAssets = assets;
        this.cdr.detectChanges();
      });
    }

    if (this.stepperRef) {
      this.suppressStepperSelectionChange = true;
      this.stepperRef.selectedIndex = step - 1;

      setTimeout(() => {
        this.suppressStepperSelectionChange = false;
      }, 0);
    }

    this.cdr.detectChanges();
  }

  public onNextFromStep1(): void {
    this.step1Completed = true;
    this.editorStateService.editorStep = 2;
    this.roomWallService.regenerateAllWalls();
    this.cdr.detectChanges();

    queueMicrotask(() => this.stepperRef?.next());
  }

  public onBackToStep1(): void {
    this.editorStateService.editorStep = 1;
    this.roomWallService.hideAllWalls();
    this.cdr.detectChanges();

    queueMicrotask(() => this.stepperRef?.previous());
  }

  public onNextFromStep2(): void {
    this.step2Completed = true;
    this.editorStateService.editorStep = 3;
    this.roomWallService.regenerateAllWalls();

    if (this.furnitureAssets.length === 0) {
      this.assetsService.getFurnitureAssets().subscribe(assets => {
        this.furnitureAssets = assets;
        this.cdr.detectChanges();
      });
    }

    this.cdr.detectChanges();
    queueMicrotask(() => this.stepperRef?.next());
  }

  public onBackToStep2(): void {
    this.editorStateService.editorStep = 2;
    this.roomWallService.regenerateAllWalls();
    this.cdr.detectChanges();

    queueMicrotask(() => this.stepperRef?.previous());
  }

  onStepperSelectionChange(event: StepperSelectionEvent) {
    const newStep = (event.selectedIndex + 1) as 1 | 2 | 3;
    this.editorStateService.editorStep = newStep;

    if (newStep === 1) this.roomWallService.hideAllWalls();
    else this.roomWallService.regenerateAllWalls();

    if (newStep === 3 && this.furnitureAssets.length === 0) {
      this.assetsService.getFurnitureAssets().subscribe(assets => {
        this.furnitureAssets = assets;
        this.cdr.detectChanges();
      });
    }
    this.editorEventsService.setCanvasListeners();
    this.cdr.detectChanges();
  }

  startPlacingFeature(type: 'window' | 'door') {
    this.editorStateService.placingFeatureType = type;
    this.editorEventsService.initFeaturePreview();
  }

  onRoomTypeChange(index: number, type: string) {
    this.editorStateService.roomMetadata[index].type = type;
  }

  getRoomTypeLabel(key: string): string {
    return this.roomTypes.find(rt => rt.key === key)?.label || 'Type: N/A';
  }

  onWallColorPicked(ev: { hex: string; num: number }) {
    this.wallColor = ev.hex;
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

  startPlacingFurniture(asset: FurnitureAsset) {
    if (this.editorEventsService.furniturePlacementActive && this.editorEventsService.placingFurnitureModel) {
      this.threeRenderService.scene.remove(this.editorEventsService.placingFurnitureModel);
      this.editorEventsService.placingFurnitureModel = null;
      this.editorEventsService.furniturePlacementActive = false;
    }

    const basePath = `assets/3d_objects/${asset.folder}/`;
    if (asset.mtl) {
      const mtlLoader = new MTLLoader();
      mtlLoader.setPath(basePath);
      mtlLoader.load(asset.mtl, (materials) => {
        materials.preload();
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        objLoader.setPath(basePath);
        objLoader.load(asset.obj, (object) => {
          this.preparePlacementModel(object, asset);
        });
      });
    } else {
      const objLoader = new OBJLoader();
      objLoader.setPath(basePath);
      objLoader.load(asset.obj, (object) => {
        this.preparePlacementModel(object, asset);
      });
    }
  }

  private preparePlacementModel(object: THREE.Object3D, asset: FurnitureAsset) {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 1.2;
    object.scale.setScalar(asset.scale || 1);
    const center = new THREE.Vector3();
    box.getCenter(center);
    object.position.sub(center);
    const newBox = new THREE.Box3().setFromObject(object);
    object.position.y -= newBox.min.y;

    this.threeRenderService.scene.add(object);
    this.editorEventsService.enableFurniturePlacement(object, asset);
  }

  private hydratePlacedFurnitureFromProject(data: ProjectData): void {
    const list = (data as any)?.furniture as { assetId: string; position: { x: number; y: number; z: number }; rotation: number }[] | undefined;
    if (!list || list.length === 0) {
      this.editorStateService.placedFurnitures = [];
      return;
    }

    this.editorStateService.placedFurnitures = [];

    for (const f of list) {
      const asset = this.furnitureAssets.find(a => a.folder === f.assetId);
      if (!asset) continue;

      const basePath = `assets/3d_objects/${asset.folder}/`;
      const addFurniture = (object: THREE.Object3D) => {
        object.position.set(f.position.x, f.position.y, f.position.z);
        object.rotation.y = f.rotation ?? 0;
        object.scale.setScalar(asset.scale || 1);
        this.threeRenderService.scene.add(object);

        this.editorStateService.placedFurnitures.push({
          asset,
          position: object.position.clone(),
          rotation: object.rotation.y,
          mesh: object
        });
      };

      if (asset.mtl) {
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath(basePath);
        mtlLoader.load(asset.mtl, (materials) => {
          materials.preload();
          const objLoader = new OBJLoader();
          objLoader.setMaterials(materials);
          objLoader.setPath(basePath);
          objLoader.load(asset.obj, addFurniture);
        });
      } else {
        const objLoader = new OBJLoader();
        objLoader.setPath(basePath);
        objLoader.load(asset.obj, addFurniture);
      }
    }
  }

  // ========== FEEDBACK METHODS ==========

  loadFeedbackMarkers(): void {
    if (!this.projectId) return;

    this.notificationService.getFeedbackByProject(this.projectId).subscribe({
      next: (feedbacks) => {
        this.feedbackData = feedbacks;
        this.clearFeedbackMarkers();

        feedbacks.filter(f => f.status === 'pending').forEach(feedback => {
          this.createFeedbackMarker(feedback);
        });
      },
      error: (err) => console.error('Failed to load feedback:', err)
    });
  }

  private createFeedbackMarker(feedback: Feedback): void {
    const geometry = new THREE.SphereGeometry(0.15, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const marker = new THREE.Mesh(geometry, material);

    marker.position.set(
      feedback.position.x,
      feedback.position.y + 0.5,
      feedback.position.z
    );
    marker.userData['feedbackId'] = feedback._id;
    marker.userData['isFeedbackMarker'] = true;

    this.threeRenderService.scene.add(marker);
    this.feedbackMarkers.push(marker);
    this.editorStateService.feedbackMarkers.push(marker);
  }

  private clearFeedbackMarkers(): void {
    this.feedbackMarkers.forEach(marker => {
      this.threeRenderService.scene.remove(marker);
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
    });
    this.feedbackMarkers = [];
    this.editorStateService.feedbackMarkers = [];
  }

  onElementSelectedForFeedback(
    elementType: 'room' | 'wall' | 'furniture',
    elementId: string,
    position: THREE.Vector3
  ): void {
    if (!this.feedbackMode || !this.projectId) return;

    const dialogData: FeedbackDialogData = {
      elementType,
      elementId,
      position: { x: position.x, y: position.y, z: position.z }
    };

    const dialogRef = this.dialog.open(FeedbackDialogComponent, {
      width: '400px',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.message) {
        this.notificationService.createFeedback({
          projectId: this.projectId!,
          elementType,
          elementId,
          position: { x: position.x, y: position.y, z: position.z },
          message: result.message
        }).subscribe({
          next: () => {
            this.loadFeedbackMarkers();
          },
          error: (err) => console.error('Failed to create feedback:', err)
        });
      }
    });
  }

  onFeedbackMarkerClicked(feedbackId: string): void {
    const feedback = this.feedbackData.find(f => f._id === feedbackId);
    if (!feedback) return;

    const canResolve = this.userType === 'architect';

    const dialogRef = this.dialog.open(FeedbackViewDialogComponent, {
      width: '450px',
      data: { feedback, canResolve }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.resolve) {
        this.notificationService.resolveFeedback(feedbackId).subscribe({
          next: () => {
            this.loadFeedbackMarkers();
          },
          error: (err) => console.error('Failed to resolve feedback:', err)
        });
      }
    });
  }
}