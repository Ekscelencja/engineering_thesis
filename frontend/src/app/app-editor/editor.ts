import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, signal, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { EditorStateService } from '../services/threejs/editor-state.service';
import { ProjectService, ProjectData } from '../services/api/project.service';
import { ThreeRenderService } from '../services/threejs/three-render.service';
import { RoomWallService } from '../services/threejs/room-wall.service';
import { calculatePolygonArea, isNearFirstVertex } from '../utils/geometry-utils';

@Component({
  selector: 'app-editor',
  standalone: true,
  templateUrl: './editor.html',
  styleUrls: ['./editor.scss'],
  imports: [CommonModule, FormsModule]
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private raycaster = new THREE.Raycaster();
  // Returns the index of the currently selected room, or -1 if none
  public get selectedRoomIndex(): number {
    const idx = this.editorStateService.selectedRoomMesh ? this.editorStateService.roomMeshes.indexOf(this.editorStateService.selectedRoomMesh) : -1;
    console.log('[DEBUG] selectedRoomIndex:', idx);
    return idx;
  }

  constructor(
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private editorStateService: EditorStateService,
    public threeRenderService: ThreeRenderService,
    private roomWallService: RoomWallService,
    private projectService: ProjectService,
  ) { }

  ngAfterViewInit() {
    this.threeRenderService.init(this.canvasRef.nativeElement);
    this.threeRenderService.animate();
    window.addEventListener('resize', () => this.threeRenderService.resize(this.canvasRef.nativeElement));
    // Attach mouse event listener for drawing
    this.ngZone.runOutsideAngular(() => {
      this.setCanvasListeners();
      window.addEventListener('pointermove', this.onHandlePointerMove);
      window.addEventListener('pointerup', this.onHandlePointerUp);
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('keypress', this.onKeyPress);
    });
  }

  ngOnDestroy() {
    this.threeRenderService.stopAnimation();
    if (this.threeRenderService.renderer) this.threeRenderService.renderer.dispose();
    this.deleteCanvasListeners();
    window.removeEventListener('pointermove', this.onHandlePointerMove);
    window.removeEventListener('pointerup', this.onHandlePointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('keypress', this.onKeyPress);
    window.removeEventListener('resize', () => this.threeRenderService.resize(this.canvasRef.nativeElement));
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Control') {
      this.editorStateService.ctrlPressed = true;
      if (this.editorStateService.ctrlPressed) this.threeRenderService.controls.enabled = true;
    }
    if (event.key === 'Delete') {
      this.deleteSelectedRoom();
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Control') {
      this.editorStateService.ctrlPressed = false;
      if (!this.editorStateService.ctrlPressed) this.threeRenderService.controls.enabled = false;
    }
  };

  private onKeyPress = (event: KeyboardEvent) => {
    if (event.key === 'd' || event.key === 'D') {
      this.editorStateService.meshDrawingActive = !this.editorStateService.meshDrawingActive;
      this.setCanvasListeners();
      if (!this.editorStateService.meshDrawingActive) {
        // Remove unfinished drawing line and vertex highlights
        if (this.editorStateService.drawingLine) {
          this.threeRenderService.scene.remove(this.editorStateService.drawingLine);
          this.editorStateService.drawingLine.geometry.dispose();
          (this.editorStateService.drawingLine.material as THREE.Material).dispose();
          this.editorStateService.drawingLine = null;
        }
        this.clearDrawingVertexHighlights();
        this.editorStateService.isDrawing = false;
        this.editorStateService.drawingVertices = [];
      }
    }
    if (event.key === 'e' || event.key === 'E') {
      this.editorStateService.editMode = !this.editorStateService.editMode;
      console.log('Edit mode:', this.editorStateService.editMode);
      this.setCanvasListeners();
      if (this.editorStateService.editMode && this.editorStateService.selectedRoomMesh) {
        this.showVertexHandles();
      } else {
        this.hideVertexHandles();
      }
    }
  };

  private setCanvasListeners() {
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onPointerDown);
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onRoomSelect);
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onHandlePointerDown);

    if (this.editorStateService.editMode) {
      this.canvasRef.nativeElement.addEventListener('pointerdown', this.onHandlePointerDown);
    } else if (this.editorStateService.meshDrawingActive) {
      this.canvasRef.nativeElement.addEventListener('pointerdown', this.onPointerDown);
    } else {
      this.canvasRef.nativeElement.addEventListener('pointerdown', this.onRoomSelect);
    }
  }

  private deleteCanvasListeners() {
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onPointerDown);
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onRoomSelect);
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onHandlePointerDown);
  }

  private getWorldXZFromPointer(event: PointerEvent): { x: number, z: number } | null {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.threeRenderService.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // XZ plane at Y=0
    const intersection = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, intersection)) {
      // Optional: snap to grid (1 meter)
      return {
        x: Math.round(intersection.x),
        z: Math.round(intersection.z)
      };
    }
    return null;
  }

  // Handles pointer down events for drawing
  private onPointerDown = (event: PointerEvent) => {
    if (this.editorStateService.ctrlPressed || !this.editorStateService.meshDrawingActive) return;

    if (!this.editorStateService.isDrawing) {
      this.editorStateService.isDrawing = true;
      this.editorStateService.drawingVertices = [];
      this.clearDrawingVertexHighlights();

      if (this.editorStateService.drawingLine) {
        this.threeRenderService.scene.remove(this.editorStateService.drawingLine);
        this.editorStateService.drawingLine.geometry.dispose();
        (this.editorStateService.drawingLine.material as THREE.Material).dispose();
        this.editorStateService.drawingLine = null;
      }
    }
    const point = this.getWorldXZFromPointer(event);
    if (point) {
      if (this.editorStateService.drawingVertices.length >= 3 && isNearFirstVertex(point, this.editorStateService.drawingVertices[0], 0.3)) {
        this.closePolygon();
        return;
      }
      this.editorStateService.drawingVertices.push(point);
      this.highlightDrawingVertex(point);
      this.updateDrawingLine();
    }
  };

  private updateDrawingLine() {
    if (this.editorStateService.drawingLine) {
      this.threeRenderService.scene.remove(this.editorStateService.drawingLine);
      this.editorStateService.drawingLine.geometry.dispose();
      (this.editorStateService.drawingLine.material as THREE.Material).dispose();
      this.editorStateService.drawingLine = null;
    }
    if (this.editorStateService.drawingVertices.length < 2) return;

    const points = this.editorStateService.drawingVertices.map((v: { x: number, z: number }) => new THREE.Vector3(v.x, 0.01, v.z));
    const geomerty = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
    this.editorStateService.drawingLine = new THREE.Line(geomerty, material);
    this.threeRenderService.scene.add(this.editorStateService.drawingLine);
  }

  private highlightDrawingVertex(position: { x: number, z: number }) {
    const geometry = new THREE.SphereGeometry(0.2, 16, 16);
    const material = new THREE.MeshStandardMaterial({ color: 0xff8800 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, 0.1, position.z);
    this.threeRenderService.scene.add(mesh);
    this.editorStateService.drawingVertexMeshes.push(mesh);
  }

  private clearDrawingVertexHighlights() {
    for (const mesh of this.editorStateService.drawingVertexMeshes) {
      this.threeRenderService.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.editorStateService.drawingVertexMeshes = [];
  }

  // Find or add a global vertex, return its index
  private findOrAddGlobalVertex(v: { x: number, z: number }, threshold: number = 0.01): number {
    for (let i = 0; i < this.editorStateService.globalVertices.length; i++) {
      const gv = this.editorStateService.globalVertices[i];
      if (Math.abs(gv.x - v.x) < threshold && Math.abs(gv.z - v.z) < threshold) {
        return i;
      }
    }
    this.editorStateService.globalVertices.push({ x: v.x, z: v.z });
    return this.editorStateService.globalVertices.length - 1;
  }

  private closePolygon() {
    console.log('[DEBUG] closePolygon called');
    this.editorStateService.isDrawing = false;
    this.clearDrawingVertexHighlights();
    if (this.editorStateService.drawingLine) {
      this.threeRenderService.scene.remove(this.editorStateService.drawingLine);
      this.editorStateService.drawingLine.geometry.dispose();
      (this.editorStateService.drawingLine.material as THREE.Material).dispose();
      this.editorStateService.drawingLine = null;
    }

    // Build room as indices into globalVertices
    const indices: number[] = [];
    for (const v of this.editorStateService.drawingVertices) {
      indices.push(this.findOrAddGlobalVertex(v));
    }
    this.editorStateService.roomVertexIndices.push(indices);

    // Generate mesh from globalVertices and indices
    const verts = indices.map(idx => this.editorStateService.globalVertices[idx]);
    const shape = new THREE.Shape(verts.map(v => new THREE.Vector2(v.x, -v.z)));
    const geometry = new THREE.ShapeGeometry(shape);
    const roomColor = Math.floor(Math.random() * 0xffffff);
    const material = new THREE.MeshStandardMaterial({
      color: roomColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;
    this.threeRenderService.scene.add(mesh);

    this.editorStateService.roomMeshes.push(mesh);
    console.log('[DEBUG] Room meshes count:', this.editorStateService.roomMeshes.length);

    // Add default metadata for the new room
    const area = calculatePolygonArea(verts);
    this.editorStateService.roomMetadata.push({
      name: `Room ${this.editorStateService.roomMeshes.length}`,
      type: 'Generic',
      area
    });
    console.log('[DEBUG] Room metadata count:', this.editorStateService.roomMetadata.length, this.editorStateService.roomMetadata);

    // Push walls for this new room
    const walls = this.roomWallService.generateWallsForRoom(
      this.threeRenderService.scene, verts, roomColor
    );
    this.editorStateService.allWallMeshes.push(walls);

    // Re-enable selection after drawing
    this.setCanvasListeners();
    console.log('[DEBUG] setCanvasListeners called after closePolygon');
  }

  private onRoomSelect = (event: PointerEvent) => {
    console.log('[DEBUG] onRoomSelect fired');
    if (this.editorStateService.ctrlPressed || this.editorStateService.meshDrawingActive) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.threeRenderService.camera);

    const intersects = this.raycaster.intersectObjects(this.editorStateService.roomMeshes);
    this.ngZone.run(() => {
      if (intersects.length > 0) {
        if (this.editorStateService.selectedRoomMesh) {
          (this.editorStateService.selectedRoomMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        }
        this.editorStateService.selectedRoomMesh = intersects[0].object as THREE.Mesh;
        console.log('[DEBUG] Room selected:', this.editorStateService.selectedRoomMesh, 'Index:', this.selectedRoomIndex);
        (this.editorStateService.selectedRoomMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0xffff00);
      } else {
        if (this.editorStateService.selectedRoomMesh) {
          (this.editorStateService.selectedRoomMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
          this.editorStateService.selectedRoomMesh = null;
        }
        console.log('[DEBUG] No room selected');
      }
      this.cdr.detectChanges();
    });
  }

  private deleteSelectedRoom() {
    console.log('[DEBUG] deleteSelectedRoom called');
    if (!this.editorStateService.selectedRoomMesh) return;

    const index = this.editorStateService.roomMeshes.indexOf(this.editorStateService.selectedRoomMesh!);
    if (index === -1) return;

    this.threeRenderService.scene.remove(this.editorStateService.selectedRoomMesh);
    this.editorStateService.selectedRoomMesh.geometry.dispose();
    (this.editorStateService.selectedRoomMesh.material as THREE.Material).dispose();
    this.editorStateService.roomMeshes.splice(index, 1);
    this.editorStateService.roomVertexIndices.splice(index, 1);
    console.log('[DEBUG] Room deleted. Meshes:', this.editorStateService.roomMeshes.length, 'Metadata:', this.editorStateService.roomMetadata.length);

    // Remove metadata for the deleted room
    this.editorStateService.roomMetadata.splice(index, 1);

    const wallMeshes = this.editorStateService.allWallMeshes[index];
    if (wallMeshes) {
      for (const wallMesh of wallMeshes) {
        this.threeRenderService.scene.remove(wallMesh);
        wallMesh.geometry.dispose();
        (wallMesh.material as THREE.Material).dispose();
      }
      this.editorStateService.allWallMeshes.splice(index, 1);
    }
    this.editorStateService.selectedRoomMesh = null;
  }

  private showVertexHandles() {
    // Remove any existing handles
    for (const handle of this.editorStateService.vertexHandles) {
      this.threeRenderService.scene.remove(handle);
      handle.geometry.dispose();
      (handle.material as THREE.Material).dispose();
    }
    this.editorStateService.vertexHandles = [];

    const index = this.editorStateService.roomMeshes.indexOf(this.editorStateService.selectedRoomMesh!);
    if (index === -1) return;

    this.editorStateService.editingRoomIndex = index;
    // Use globalVertices for handles
    const indices = this.editorStateService.roomVertexIndices[this.editorStateService.editingRoomIndex!];
    for (const idx of indices) {
      const v = this.editorStateService.globalVertices[idx];
      const sphereGeometry = new THREE.SphereGeometry(0.35, 25, 25);
      const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      const handle = new THREE.Mesh(sphereGeometry, sphereMaterial);
      handle.position.set(v.x, 0.1, v.z);
      this.threeRenderService.scene.add(handle);
      this.editorStateService.vertexHandles.push(handle);
    }
  }

  private hideVertexHandles() {
    for (const handle of this.editorStateService.vertexHandles) {
      this.threeRenderService.scene.remove(handle);
      handle.geometry.dispose();
      (handle.material as THREE.Material).dispose();
    }
    this.editorStateService.vertexHandles = [];
    this.editorStateService.editingRoomIndex = null;
  }

  private onHandlePointerDown = (event: PointerEvent) => {
    if (!this.editorStateService.editMode) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.threeRenderService.camera);
    const intersects = this.raycaster.intersectObjects(this.editorStateService.vertexHandles);
    if (intersects.length > 0) {
      this.editorStateService.draggingHandleIndex = this.editorStateService.vertexHandles.indexOf(intersects[0].object as THREE.Mesh);
      event.preventDefault();
      event.stopPropagation(); // avoid any other pointerdown listeners
    }
  };

  private onHandlePointerMove = (event: PointerEvent) => {
    if (!this.editorStateService.editMode || this.editorStateService.draggingHandleIndex === null) return;
    const point = this.getWorldXZFromPointer(event);
    if (point) {
      // Update the global vertex
      const indices = this.editorStateService.roomVertexIndices[this.editorStateService.editingRoomIndex!];
      const globalIdx = indices[this.editorStateService.draggingHandleIndex!];
      this.editorStateService.globalVertices[globalIdx] = { x: point.x, z: point.z };
      this.editorStateService.vertexHandles[this.editorStateService.draggingHandleIndex!].position.set(point.x, 0.1, point.z);
      // Update all rooms that use this global vertex
      for (let roomIdx = 0; roomIdx < this.editorStateService.roomVertexIndices.length; roomIdx++) {
        if (this.editorStateService.roomVertexIndices[roomIdx].includes(globalIdx)) {
          this.updateRoomMeshAndWalls(roomIdx);
        }
      }
    }
  };

  private onHandlePointerUp = (event: PointerEvent) => {
    if (!this.editorStateService.editMode) return;
    this.editorStateService.draggingHandleIndex = null;
  }

  private updateRoomMeshAndWalls(roomIndex: number) {
    const mesh = this.editorStateService.roomMeshes[roomIndex];
    const indices = this.editorStateService.roomVertexIndices[roomIndex];
    const verts = indices.map(idx => this.editorStateService.globalVertices[idx]);

    // Rebuild geometry in XY and keep the same Mesh instance
    const shape = new THREE.Shape(verts.map(v => new THREE.Vector2(v.x, -v.z)));
    const newGeometry = new THREE.ShapeGeometry(shape);

    // Update geometry in place (prevents duplicate meshes)
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = newGeometry;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;

    // Update handle positions if this is the currently edited room
    if (this.editorStateService.editingRoomIndex === roomIndex) {
      for (let i = 0; i < verts.length; i++) {
        this.editorStateService.vertexHandles[i].position.set(verts[i].x, 0.1, verts[i].z);
      }
    }

    // Regenerate walls for this room at the same index
    const oldWalls = this.editorStateService.allWallMeshes[roomIndex] ?? [];
    for (const wall of oldWalls) {
      this.threeRenderService.scene.remove(wall);
      wall.geometry.dispose();
      (wall.material as THREE.Material).dispose();
    }
    this.editorStateService.allWallMeshes[roomIndex] = [];

    const roomColor = (mesh.material as THREE.MeshStandardMaterial).color.getHex();
    const walls = this.roomWallService.generateWallsForRoom(
      this.threeRenderService.scene, verts, roomColor
    );
    this.editorStateService.allWallMeshes[roomIndex] = walls;

    // Update area in metadata
    this.editorStateService.roomMetadata[roomIndex].area = calculatePolygonArea(verts);
  }

  public exportProject() {
    const data = {
      globalVertices: this.editorStateService.globalVertices,
      roomVertexIndices: this.editorStateService.roomVertexIndices,
      roomMetadata: this.editorStateService.roomMetadata
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Import project state from a JSON file
  public importProject(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        this.rebuildFromData(data);
      } catch (e) {
        alert('Invalid project file.');
      }
    };
    reader.readAsText(file);
  }

  // Restore the editor state from imported data
  private rebuildFromData(data: any) {
    // Clear current scene
    for (const mesh of this.editorStateService.roomMeshes) {
      this.threeRenderService.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    for (const wallArr of this.editorStateService.allWallMeshes) {
      for (const wall of wallArr) {
        this.threeRenderService.scene.remove(wall);
        wall.geometry.dispose();
        (wall.material as THREE.Material).dispose();
      }
    }
    this.editorStateService.roomMeshes = [];
    this.editorStateService.allWallMeshes = [];
    this.editorStateService.roomMetadata = [];
    this.editorStateService.globalVertices = [];
    this.editorStateService.roomVertexIndices = [];
    this.editorStateService.selectedRoomMesh = null;

    // Restore data
    this.editorStateService.globalVertices = data.globalVertices || [];
    this.editorStateService.roomVertexIndices = data.roomVertexIndices || [];
    this.editorStateService.roomMetadata = data.roomMetadata || [];

    // Rebuild meshes and walls
    for (let i = 0; i < this.editorStateService.roomVertexIndices.length; i++) {
      const indices = this.editorStateService.roomVertexIndices[i];
      const verts = indices.map(idx => this.editorStateService.globalVertices[idx]);
      const shape = new THREE.Shape(verts.map(v => new THREE.Vector2(v.x, -v.z)));
      const geometry = new THREE.ShapeGeometry(shape);
      const roomColor = Math.floor(Math.random() * 0xffffff);
      const material = new THREE.MeshStandardMaterial({
        color: roomColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0;
      this.threeRenderService.scene.add(mesh);
      this.editorStateService.roomMeshes.push(mesh);
      const walls = this.roomWallService.generateWallsForRoom(
        this.threeRenderService.scene, verts, roomColor
      );
      this.editorStateService.allWallMeshes.push(walls);
    }
    this.setCanvasListeners();
    this.cdr.detectChanges();
  }

  public projectTitle: string = '';

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

  // Load project from backend by ID
  public loadProjectFromServer(id: string) {
    this.projectService.loadProject(id).subscribe({
      next: (data) => this.rebuildFromData(data),
      error: (err) => alert('Load failed: ' + err.message)
    });
  }

  public get roomMetadata() {
    return this.editorStateService.roomMetadata;
  }
  public get selectedRoomMesh() {
    return this.editorStateService.selectedRoomMesh;
  }
}
