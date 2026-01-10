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
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { StepperSelectionEvent } from '@angular/cdk/stepper';
import { MatTableModule } from '@angular/material/table';
import { ColorPickerComponent } from './color-picker/color-picker';
import { AssetsService, FurnitureAsset } from '../services/api/assets.service';
import { FurniturePreviewComponent } from '../furniture-preview/furniture-preview';
import { isPointInPolygon, doesAABBIntersectLine } from '../utils/geometry-utils';
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
    NumberToColorPipe,
    ColorPickerComponent,
    FurniturePreviewComponent
  ]
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  public wallColor: string = '#cccccc';
  public wallTexture: string = '';
  public floorColor: string = '#888888';
  public floorTexture: string = '';
  public wallTextureTileSizeM = 1;
  public furnitureAssets: FurnitureAsset[] = [];
  public isPlacingFurniture: boolean = false;
  public placingFurnitureAsset: FurnitureAsset | null = null;
  public placingFurnitureModel: THREE.Object3D | null = null;
  public placedFurniture: { asset: FurnitureAsset, position: THREE.Vector3, rotation: number }[] = [];

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
  isNewProject: boolean = true;
  clientId: string | null = null;
  projectTitle: string | null = null;
  @Input() userType: string | null = null;
  @Input() projectId: string | null = null;
  @Input() newProjectClientId: string | null = null;
  @Input() newProjectTitle: string | null = null;
  @Input() projectData: Partial<ProjectData> | null = null;
  @Output() closeEditor = new EventEmitter<void>();

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
    this.canvasRef.nativeElement.addEventListener('mousemove', this.onCanvasMouseMove.bind(this));
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['projectId'] && this.projectId) {
      console.log('EditorComponent detected projectId change:', this.projectId);
      this.projectService.loadProject(this.projectId).subscribe({
        next: (data) => {
          this.isNewProject = false;
          this.projectTitle = data.title;
          this.clientId = data.client;

          console.log('Loaded project data:', data);

          const step = ((data.editorStep || 1) as 1 | 2 | 3);
          this.editorStateService.editorStep = step;

          this.roomWallService.rebuildFromData(data);
          console.log('Rebuilt scene from project data.');

          // IMPORTANT: set completion flags BEFORE selecting the step
          this.applyCompletionFromStep(step);
          this.cdr.detectChanges();

          // select after completion is applied
          setTimeout(() => {
            if (this.stepperRef) {
              this.stepperRef.selectedIndex = step - 1;
              this.cdr.detectChanges();
            }
          }, 0);


          this.hydratePlacedFurnitureFromProject(data);
        },
        error: (err) => alert('Load failed: ' + err.message)
      });
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
    console.log(this.isNewProject ? 'Creating new project...' : 'Updating existing project...');
    const project: ProjectData = {
      title: this.isNewProject ? this.newProjectTitle! : this.projectTitle!,
      client: this.isNewProject ? this.newProjectClientId! : this.clientId!,
      globalVertices: this.editorStateService.globalVertices,
      roomVertexIndices: this.editorStateService.roomVertexIndices,
      roomMetadata: this.editorStateService.roomMetadata,
      wallAppearance: this.editorStateService.wallAppearance,
      floorAppearance: this.editorStateService.floorAppearance,
      furniture: this.placedFurniture.map(f => ({
        assetId: f.asset.folder, // or f.asset._id if using DB ids
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
    // Always sync state + UI. Do NOT early-return.
    this.editorStateService.editorStep = step;

    // keep your scene logic in sync
    if (step === 1) this.roomWallService.hideAllWalls();
    else this.roomWallService.regenerateAllWalls();

    // step 3 assets
    if (step === 3 && this.furnitureAssets.length === 0) {
      this.assetsService.getFurnitureAssets().subscribe(assets => {
        this.furnitureAssets = assets;
        this.cdr.detectChanges();
      });
    }

    // keep stepper header in sync (guard selectionChange recursion)
    if (this.stepperRef) {
      this.suppressStepperSelectionChange = true;
      this.stepperRef.selectedIndex = step - 1;

      // release guard after the stepper processes the change
      setTimeout(() => {
        this.suppressStepperSelectionChange = false;
      }, 0);
    }

    this.cdr.detectChanges();
  }

  public onNextFromStep1(): void {
    // mark step 1 completed BEFORE moving
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
    // keep state in sync if user clicks headers
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

    this.cdr.detectChanges();
  }

  startPlacingFeature(type: 'window' | 'door') {
    this.editorStateService.placingFeatureType = type;
    this.editorEventsService.initFeaturePreview();
  }

  onCanvasClick(event: MouseEvent) {
    if (this.isPlacingFurniture && this.placingFurnitureModel) {
      console.log('Placed furniture:', this.placingFurnitureAsset, 'at', this.placingFurnitureModel.position);
      // Finalize placement: optionally clone or keep reference
      this.placedFurniture.push({
        asset: this.placingFurnitureAsset!,
        position: this.placingFurnitureModel.position.clone(),
        rotation: this.placingFurnitureModel.rotation.y
      });
      // Clear placement state
      this.isPlacingFurniture = false;
      this.placingFurnitureAsset = null;
      this.placingFurnitureModel = null;
      // Optionally: store placed furniture in a list for saving
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

  startPlacingFurniture(asset: FurnitureAsset) {
    this.isPlacingFurniture = true;
    this.placingFurnitureAsset = asset;

    // Remove previous preview model if any
    if (this.placingFurnitureModel) {
      this.threeRenderService.scene.remove(this.placingFurnitureModel);
      this.placingFurnitureModel = null;
    }

    // Load the model for placement preview
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
          this.preparePlacementModel(object, asset.scale);
        });
      });
    } else {
      const objLoader = new OBJLoader();
      objLoader.setPath(basePath);
      objLoader.load(asset.obj, (object) => {
        this.preparePlacementModel(object, asset.scale);
      });
    }
  }

  private preparePlacementModel(object: THREE.Object3D, scale: number) {
    // Center and scale as in preview
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 1.2;
    object.scale.setScalar(scale || 1);
    const center = new THREE.Vector3();
    box.getCenter(center);
    object.position.sub(center);
    const newBox = new THREE.Box3().setFromObject(object);
    object.position.y -= newBox.min.y;

    this.threeRenderService.scene.add(object);
    this.placingFurnitureModel = object;
  }

  private hydratePlacedFurnitureFromProject(data: ProjectData): void {
    const list = (data as any)?.furniture as { assetId: string; position: { x: number; y: number; z: number }; rotation: number }[] | undefined;
    if (!list || list.length === 0) {
      this.placedFurniture = [];
      return;
    }

    // Build placedFurniture using a minimal asset object if we don't have furnitureAssets loaded yet.
    // We only need `folder` for saving back to DB.
    this.placedFurniture = list.map(f => ({
      asset: ({ folder: f.assetId } as unknown as FurnitureAsset),
      position: new THREE.Vector3(f.position.x, f.position.y, f.position.z),
      rotation: f.rotation ?? 0
    }));
  }

  onCanvasMouseMove(event: MouseEvent) {
    if (this.isPlacingFurniture && this.placingFurnitureModel) {
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
        const point = { x: intersection.x, z: intersection.z };
        let insideAnyRoom = false;
        for (const indices of this.editorStateService.roomVertexIndices) {
          const verts = indices.map(idx => this.editorStateService.globalVertices[idx]);
          if (isPointInPolygon(point, verts)) {
            insideAnyRoom = true;
            break;
          }
        }
        if (insideAnyRoom) {
          // --- Wall collision check ---
          // Compute AABB of furniture at intended position
          const box = new THREE.Box3().setFromObject(this.placingFurnitureModel);
          const size = new THREE.Vector3();
          box.getSize(size);
          const min = { x: intersection.x + box.min.x, z: intersection.z + box.min.z };
          const max = { x: intersection.x + box.max.x, z: intersection.z + box.max.z };
          let collision = false;
          // For each wall segment
          for (const indices of this.editorStateService.roomVertexIndices) {
            for (let i = 0; i < indices.length; i++) {
              const a = this.editorStateService.globalVertices[indices[i]];
              const b = this.editorStateService.globalVertices[indices[(i + 1) % indices.length]];
              if (doesAABBIntersectLine({ min, max }, a, b)) {
                collision = true;
                break;
              }
            }
            if (collision) break;
          }
          if (!collision) {
            const SNAP_DISTANCE = 0.3; // Adjust as needed

            let snapWall: { a: { x: number, z: number }, b: { x: number, z: number }, dist: number, closest: { x: number, z: number } } | null = null;

            for (const indices of this.editorStateService.roomVertexIndices) {
              for (let i = 0; i < indices.length; i++) {
                const a = this.editorStateService.globalVertices[indices[i]];
                const b = this.editorStateService.globalVertices[indices[(i + 1) % indices.length]];
                // Closest point on wall to intended position
                const wallVec = { x: b.x - a.x, z: b.z - a.z };
                const wallLenSq = wallVec.x * wallVec.x + wallVec.z * wallVec.z;
                let t = ((point.x - a.x) * wallVec.x + (point.z - a.z) * wallVec.z) / (wallLenSq || 1e-10);
                t = Math.max(0, Math.min(1, t));
                const closest = { x: a.x + t * wallVec.x, z: a.z + t * wallVec.z };
                const dist = Math.hypot(point.x - closest.x, point.z - closest.z);
                if (dist < SNAP_DISTANCE && (!snapWall || dist < snapWall.dist)) {
                  snapWall = { a, b, dist, closest };
                }
              }
            }

            if (snapWall) {
              // Snap position
              this.placingFurnitureModel.position.x = snapWall.closest.x;
              this.placingFurnitureModel.position.z = snapWall.closest.z;

              // Snap rotation: make the back face the wall
              const dx = snapWall.b.x - snapWall.a.x;
              const dz = snapWall.b.z - snapWall.a.z;
              const wallAngle = Math.atan2(dz, dx);
              // Furniture "back" is usually -Z, so rotate to face away from wall
              this.placingFurnitureModel.rotation.y = wallAngle + Math.PI / 2;
            } else {
              // No snap: use original logic
              this.placingFurnitureModel.position.x = intersection.x;
              this.placingFurnitureModel.position.z = intersection.z;
            }
          }
          // Optionally: else, show a warning/visual cue
        }
      }
    }
  }
}