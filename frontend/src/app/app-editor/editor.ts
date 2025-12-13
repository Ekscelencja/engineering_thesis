import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, NgZone, ChangeDetectorRef, Input, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditorStateService } from '../services/threejs/editor-state.service';
import { ProjectService, ProjectData } from '../services/api/project.service';
import { ThreeRenderService } from '../services/threejs/three-render.service';
import { RoomWallService } from '../services/threejs/room-wall.service';
import { ProjectIOService } from '../services/api/project-io.service';
import { EditorEventsService } from '../services/threejs/editor-events.service';
import { MatButtonModule } from '@angular/material/button';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

@Component({
  selector: 'app-editor',
  standalone: true,
  templateUrl: './editor.html',
  styleUrls: ['./editor.scss'],
  imports: [CommonModule, FormsModule, MatButtonModule]
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  // --- Sofa Placement Proof-of-Concept ---
  protected sofaModel: THREE.Group | null = null;
  public isPlacingSofa: boolean = false;
  public wallColor: string = '#cccccc';
  public wallTexture: string = '';
  public wallTextureTileSizeM = 1; // 1m x 1m tiles by default
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  isNewProject: boolean = false;
  clientId: string | null = null;
  projectTitle: string | null = null;
  @Input() userType: string | null = null;
  @Input() projectId: string | null = null;
  @Input() newProjectClientId: string | null = null;
  @Input() newProjectTitle: string | null = null;
  @Input() projectData: Partial<ProjectData> | null = null;
  @Output() closeEditor = new EventEmitter<void>();

  constructor(
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    protected editorStateService: EditorStateService,
    public threeRenderService: ThreeRenderService,
    private roomWallService: RoomWallService,
    private projectService: ProjectService,
    //private projectIOService: ProjectIOService,
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

  ngOnChanges(changes: SimpleChanges) {
    if (changes['projectId'] && this.projectId) {
      this.projectService.loadProject(this.projectId).subscribe({
        next: (data) => (
          this.isNewProject = false,
          this.roomWallService.rebuildFromData(data),
          this.projectTitle = data.title,
          this.clientId = data.client),
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
      roomMetadata: this.editorStateService.roomMetadata
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

  public get roomMetadata() {
    return this.editorStateService.roomMetadata;
  }
  public get selectedRoomMesh() {
    return this.editorStateService.selectedRoomMesh;
  }

  public get selectedRoomIndex() {
    return this.editorStateService.selectedRoomIndex;
  }

  startPlacingFeature(type: 'window' | 'door') {
    this.editorStateService.placingFeatureType = type;
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

  applyWallColor() {
    // Apply color to all wall meshes (proof of concept: all walls)
    const color = new THREE.Color(this.wallColor);
    for (const wallArr of this.editorStateService.allWallMeshes) {
      for (const wall of wallArr) {
        (wall.material as THREE.MeshStandardMaterial).color = color;
        (wall.material as THREE.MeshStandardMaterial).needsUpdate = true;
      }
    }
  }

  applyWallTexture() {
    if (!this.wallTexture) {
      this.applyWallColor();
      return;
    }
    const url = `assets/textures/${this.wallTexture}.jpg`;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (baseTexture) => {
        baseTexture.colorSpace = THREE.SRGBColorSpace;
        baseTexture.wrapS = THREE.RepeatWrapping;
        baseTexture.wrapT = THREE.RepeatWrapping;
        baseTexture.magFilter = THREE.LinearFilter;
        baseTexture.minFilter = THREE.LinearMipmapLinearFilter;

        const maxAniso = this.threeRenderService.renderer?.capabilities.getMaxAnisotropy?.() ?? 4;
        baseTexture.anisotropy = maxAniso;

        const tileSizeM = Math.max(0.01, this.wallTextureTileSizeM); // meters per one texture tile

        for (const wallArr of this.editorStateService.allWallMeshes) {
          for (const wall of wallArr) {
            const tex = baseTexture.clone();
            tex.needsUpdate = true;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;

            const { startV, endV, wallHeight } = wall.userData || {};
            const lenM = startV && endV ? Math.hypot(endV.x - startV.x, endV.z - startV.z) : 1;
            const hM = wallHeight ?? 2.7;

            // UVs are in meters; repeat = physical size / tile size
            tex.repeat.set(lenM / tileSizeM, hM / tileSizeM);
            tex.offset.set(0, 0);

            const mat = wall.material as THREE.MeshStandardMaterial;
            mat.map = tex;
            mat.color.set('#ffffff'); // remove tint
            mat.roughness = 0.9;
            mat.metalness = 0.0;
            mat.needsUpdate = true;
          }
        }

        if (this.threeRenderService.renderer) {
          this.threeRenderService.renderer.outputColorSpace = THREE.SRGBColorSpace;
        }
      },
      undefined,
      (err) => {
        console.error('Failed to load texture:', url, err);
        alert('Texture not found in assets/textures/');
      }
    );
  }
}