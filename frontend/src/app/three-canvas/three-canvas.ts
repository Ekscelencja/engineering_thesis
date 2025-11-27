import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, signal, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService, ProjectData } from '../services/project.service';

// Room metadata interface
interface RoomMetadata {
  name: string;
  type: string;
  area: number;
}

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';

@Component({
  selector: 'app-three-canvas',
  standalone: true,
  templateUrl: './three-canvas.html',
  styleUrls: ['./three-canvas.scss'],
  imports: [CommonModule, FormsModule]
})
export class ThreeCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private animationId: number | null = null;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private drawingVertices: { x: number, z: number }[] = [];
  private isDrawing: boolean = false;
  private drawingLine: THREE.Line | null = null;
  private roomMeshes: THREE.Mesh[] = [];
  public roomMetadata: RoomMetadata[] = [];
  // Returns the index of the currently selected room, or -1 if none
  public get selectedRoomIndex(): number {
    const idx = this.selectedRoomMesh ? this.roomMeshes.indexOf(this.selectedRoomMesh) : -1;
    console.log('[DEBUG] selectedRoomIndex:', idx);
    return idx;
  }
  private controls!: OrbitControls;
  private ctrlPressed: boolean = false;
  private meshDrawingActive: boolean = false;
  private allWallMeshes: THREE.Mesh[][] = [];
  private wallHeight: number = 2.7;
  private wallThickness: number = 0.2;
  public selectedRoomMesh: THREE.Mesh | null = null;
  private editMode = false;
  private vertexHandles: THREE.Mesh[] = [];
  private editingRoomIndex: number | null = null;
  private draggingHandleIndex: number | null = null;
  // Shared vertex system
  private globalVertices: { x: number, z: number }[] = [];
  private roomVertexIndices: number[][] = []; // Each room: array of indices into globalVertices

  constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef, private projectService: ProjectService) { }

  ngAfterViewInit() {
    this.initThree();
    this.animate();
    window.addEventListener('resize', this.onResize);
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
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.renderer) this.renderer.dispose();
    this.deleteCanvasListeners();
    window.removeEventListener('pointermove', this.onHandlePointerMove);
    window.removeEventListener('pointerup', this.onHandlePointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('keypress', this.onKeyPress);
    window.removeEventListener('resize', this.onResize);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Control') {
      this.ctrlPressed = true;
      if (this.ctrlPressed) this.controls.enabled = true;
    }
    if (event.key === 'Delete') {
      this.deleteSelectedRoom();
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Control') {
      this.ctrlPressed = false;
      if (!this.ctrlPressed) this.controls.enabled = false;
    }
  };

  private onResize = () => {
    const width = this.canvasRef.nativeElement.clientWidth || window.innerWidth;
    const height = this.canvasRef.nativeElement.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private onKeyPress = (event: KeyboardEvent) => {
    if (event.key === 'd' || event.key === 'D') {
      this.meshDrawingActive = !this.meshDrawingActive;
      this.setCanvasListeners();
    }
    if (event.key === 'e' || event.key === 'E') {
      this.editMode = !this.editMode;
      console.log('Edit mode:', this.editMode);
      this.setCanvasListeners(); // <-- add this line
      if (this.editMode && this.selectedRoomMesh) {
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

    if (this.editMode) {
      this.canvasRef.nativeElement.addEventListener('pointerdown', this.onHandlePointerDown);
    } else if (this.meshDrawingActive) {
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

  private initThree() {
    const width = this.canvasRef.nativeElement.clientWidth || 800;
    const height = this.canvasRef.nativeElement.clientHeight || 600;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.set(0, 35, 0);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvasRef.nativeElement, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0xdedede);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 50;
    this.controls.maxPolarAngle = Math.PI / 2; // Limit to horizontal view

    // Grid: 1 unit = 1 meter, 40x40 meters
    const grid = new THREE.GridHelper(40, 40, 0x888888, 0xbbbbbb);
    (grid.material as THREE.Material).opacity = 0.8;
    (grid.material as THREE.Material).transparent = true;
    this.scene.add(grid);
    const axesHelper = new THREE.AxesHelper(5);
    this.scene.add(axesHelper);
    // Axis labels (X, Z)
    this.addAxisLabel('X', 10.5, 0.01, 0, 0xff3333);
    this.addAxisLabel('Z', 0, 0.01, 10.5, 0x3333ff);

    // Tick marks every 5 meters
    for (let i = -10; i <= 10; i += 5) {
      if (i !== 0) {
        this.addAxisLabel(i.toString(), i, 0.01, 0, 0xff3333, 0.5);
        this.addAxisLabel(i.toString(), 0, 0.01, i, 0x3333ff, 0.5);
      }
    }

    // Compass (N/E/S/W) - simple arrows
    this.addCompass();

    // Remove test cube for now
    // const geometry = new THREE.BoxGeometry();
    // const material = new THREE.MeshStandardMaterial({ color: 0x0077ff });
    // const cube = new THREE.Mesh(geometry, material);
    // cube.position.set(0, 0.5, 0);
    // this.scene.add(cube);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 7.5);
    this.scene.add(light);

  }

  // Add 3D axis label (simple plane with text texture)
  private addAxisLabel(text: string, x: number, y: number, z: number, color: number, scale = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.set(1.5 * scale, 0.75 * scale, 1);
    this.scene.add(sprite);
  }

  // Add a simple compass rose in the corner (N/E/S/W)
  private addCompass() {
    // Compass is a group of arrows and labels in the +X/+Z quadrant
    const compassGroup = new THREE.Group();
    const arrowLen = 1.5;
    const arrowColor = 0x222222;
    // North (Z+)
    compassGroup.add(this.createCompassArrow(0, 0.01, 0, 0, 0, arrowLen, arrowColor, 'N'));
    // East (X+)
    compassGroup.add(this.createCompassArrow(0, 0.01, 0, arrowLen, 0, 0, arrowColor, 'E'));
    // South (Z-)
    compassGroup.add(this.createCompassArrow(0, 0.01, 0, 0, 0, -arrowLen, arrowColor, 'S'));
    // West (X-)
    compassGroup.add(this.createCompassArrow(0, 0.01, 0, -arrowLen, 0, 0, arrowColor, 'W'));
    compassGroup.position.set(-8, 0, -8);
    this.scene.add(compassGroup);
  }

  // Helper to create a compass arrow with label
  private createCompassArrow(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color: number, label: string) {
    const dir = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1).normalize();
    const origin = new THREE.Vector3(x1, y1, z1);
    const length = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1).length();
    const arrowHelper = new THREE.ArrowHelper(dir, origin, length, color, 0.3, 0.15);
    // Add label at the end
    const labelSprite = this.createCompassLabel(label, x2, y2, z2, color);
    const group = new THREE.Group();
    group.add(arrowHelper);
    group.add(labelSprite);
    return group;
  }

  private createCompassLabel(text: string, x: number, y: number, z: number, color: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y + 0.1, z);
    sprite.scale.set(0.7, 0.35, 1);
    return sprite;
  }

  private getWorldXZFromPointer(event: PointerEvent): { x: number, z: number } | null {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.camera);
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
    if (this.ctrlPressed || !this.meshDrawingActive) return;

    if (!this.isDrawing) {
      this.isDrawing = true;
      this.drawingVertices = [];

      if (this.drawingLine) {
        this.scene.remove(this.drawingLine);
        this.drawingLine.geometry.dispose();
        (this.drawingLine.material as THREE.Material).dispose();
        this.drawingLine = null;
      }
    }
    const point = this.getWorldXZFromPointer(event);
    if (point) {
      if (this.drawingVertices.length >= 3 && this.isNearFirstVertex(point)) {
        this.closePolygon();
        return;
      }
      this.drawingVertices.push(point);
      this.updateDrawingLine();
    }
  };

  private updateDrawingLine() {
    if (this.drawingLine) {
      this.scene.remove(this.drawingLine);
      this.drawingLine.geometry.dispose();
      (this.drawingLine.material as THREE.Material).dispose();
      this.drawingLine = null;
    }
    if (this.drawingVertices.length < 2) return;

    const points = this.drawingVertices.map(v => new THREE.Vector3(v.x, 0.01, v.z));
    const geomerty = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
    this.drawingLine = new THREE.Line(geomerty, material);
    this.scene.add(this.drawingLine);
  }

  // Find or add a global vertex, return its index
  private findOrAddGlobalVertex(v: { x: number, z: number }, threshold: number = 0.01): number {
    for (let i = 0; i < this.globalVertices.length; i++) {
      const gv = this.globalVertices[i];
      if (Math.abs(gv.x - v.x) < threshold && Math.abs(gv.z - v.z) < threshold) {
        return i;
      }
    }
    this.globalVertices.push({ x: v.x, z: v.z });
    return this.globalVertices.length - 1;
  }

  private closePolygon() {
    console.log('[DEBUG] closePolygon called');
    this.isDrawing = false;
    if (this.drawingLine) {
      this.scene.remove(this.drawingLine);
      this.drawingLine.geometry.dispose();
      (this.drawingLine.material as THREE.Material).dispose();
      this.drawingLine = null;
    }

    // Build room as indices into globalVertices
    const indices: number[] = [];
    for (const v of this.drawingVertices) {
      indices.push(this.findOrAddGlobalVertex(v));
    }
    this.roomVertexIndices.push(indices);

    // Generate mesh from globalVertices and indices
    const verts = indices.map(idx => this.globalVertices[idx]);
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
    this.scene.add(mesh);

    this.roomMeshes.push(mesh);
    console.log('[DEBUG] Room meshes count:', this.roomMeshes.length);

    // Add default metadata for the new room
    const area = this.calculatePolygonArea(verts);
    this.roomMetadata.push({
      name: `Room ${this.roomMeshes.length}`,
      type: 'Generic',
      area
    });
    console.log('[DEBUG] Room metadata count:', this.roomMetadata.length, this.roomMetadata);

    // Push walls for this new room
    this.generateWallsForRoom(verts, roomColor);

    // Re-enable selection after drawing
    this.setCanvasListeners();
    console.log('[DEBUG] setCanvasListeners called after closePolygon');
  }
  // Shoelace formula for area of polygon (XZ plane)
  private calculatePolygonArea(vertices: { x: number, z: number }[]): number {
    let area = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % n];
      area += v1.x * v2.z - v2.x * v1.z;
    }
    return Math.abs(area) / 2;
  }

  private isNearFirstVertex(point: { x: number, z: number }, threshold: number = 0.3): boolean {
    if (this.drawingVertices.length === 0) return false;
    const first = this.drawingVertices[0];
    const dx = point.x - first.x;
    const dz = point.z - first.z;
    return Math.sqrt(dx * dx + dz * dz) <= threshold;
  }

  private generateWallsForRoom(
    vertices: { x: number, z: number }[],
    roomColor: number,
    overrideIndex?: number
  ) {
    const currentRoomWalls: THREE.Mesh[] = [];

    for (let i = 0; i < vertices.length; i++) {
      const startV = vertices[i];
      const endV = vertices[(i + 1) % vertices.length];

      const dx = endV.x - startV.x;
      const dz = endV.z - startV.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);

      const wallGeometry = new THREE.BoxGeometry(length, this.wallHeight, this.wallThickness);
      const wallMaterial = new THREE.MeshStandardMaterial({ color: roomColor });
      const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);

      wallMesh.position.set(
        (startV.x + endV.x) / 2,
        this.wallHeight / 2,
        (startV.z + endV.z) / 2
      );
      wallMesh.rotation.y = -angle;

      this.scene.add(wallMesh);
      currentRoomWalls.push(wallMesh);
    }

    if (overrideIndex !== undefined) {
      this.allWallMeshes[overrideIndex] = currentRoomWalls;
    } else {
      this.allWallMeshes.push(currentRoomWalls);
    }
  }

  private onRoomSelect = (event: PointerEvent) => {
    console.log('[DEBUG] onRoomSelect fired');
    if (this.ctrlPressed || this.meshDrawingActive) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(this.roomMeshes);
    this.ngZone.run(() => {
      if (intersects.length > 0) {
        if (this.selectedRoomMesh) {
          (this.selectedRoomMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        }
        this.selectedRoomMesh = intersects[0].object as THREE.Mesh;
        console.log('[DEBUG] Room selected:', this.selectedRoomMesh, 'Index:', this.selectedRoomIndex);
        (this.selectedRoomMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0xffff00);
      } else {
        if (this.selectedRoomMesh) {
          (this.selectedRoomMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
          this.selectedRoomMesh = null;
        }
        console.log('[DEBUG] No room selected');
      }
      this.cdr.detectChanges();
    });
  }

  private deleteSelectedRoom() {
    console.log('[DEBUG] deleteSelectedRoom called');
    if (!this.selectedRoomMesh) return;

    const index = this.roomMeshes.indexOf(this.selectedRoomMesh!);
    if (index === -1) return;

    this.scene.remove(this.selectedRoomMesh);
    this.selectedRoomMesh.geometry.dispose();
    (this.selectedRoomMesh.material as THREE.Material).dispose();
    this.roomMeshes.splice(index, 1);
    this.roomVertexIndices.splice(index, 1);
    console.log('[DEBUG] Room deleted. Meshes:', this.roomMeshes.length, 'Metadata:', this.roomMetadata.length);

    // Remove metadata for the deleted room
    this.roomMetadata.splice(index, 1);

    const wallMeshes = this.allWallMeshes[index];
    if (wallMeshes) {
      for (const wallMesh of wallMeshes) {
        this.scene.remove(wallMesh);
        wallMesh.geometry.dispose();
        (wallMesh.material as THREE.Material).dispose();
      }
      this.allWallMeshes.splice(index, 1);
    }
    this.selectedRoomMesh = null;
  }

  private showVertexHandles() {
    // Remove any existing handles
    for (const handle of this.vertexHandles) {
      this.scene.remove(handle);
      handle.geometry.dispose();
      (handle.material as THREE.Material).dispose();
    }
    this.vertexHandles = [];

    const index = this.roomMeshes.indexOf(this.selectedRoomMesh!);
    if (index === -1) return;

    this.editingRoomIndex = index;
    // Use globalVertices for handles
    const indices = this.roomVertexIndices[this.editingRoomIndex!];
    for (const idx of indices) {
      const v = this.globalVertices[idx];
      const sphereGeometry = new THREE.SphereGeometry(0.35, 25, 25);
      const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      const handle = new THREE.Mesh(sphereGeometry, sphereMaterial);
      handle.position.set(v.x, 0.1, v.z);
      this.scene.add(handle);
      this.vertexHandles.push(handle);
    }
  }

  private hideVertexHandles() {
    for (const handle of this.vertexHandles) {
      this.scene.remove(handle);
      handle.geometry.dispose();
      (handle.material as THREE.Material).dispose();
    }
    this.vertexHandles = [];
    this.editingRoomIndex = null;
  }

  private onHandlePointerDown = (event: PointerEvent) => {
    if (!this.editMode) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.vertexHandles);
    if (intersects.length > 0) {
      this.draggingHandleIndex = this.vertexHandles.indexOf(intersects[0].object as THREE.Mesh);
      event.preventDefault();
      event.stopPropagation(); // avoid any other pointerdown listeners
    }
  };

  private onHandlePointerMove = (event: PointerEvent) => {
    if (!this.editMode || this.draggingHandleIndex === null) return;
    const point = this.getWorldXZFromPointer(event);
    if (point) {
      // Update the global vertex
      const indices = this.roomVertexIndices[this.editingRoomIndex!];
      const globalIdx = indices[this.draggingHandleIndex!];
      this.globalVertices[globalIdx] = { x: point.x, z: point.z };
      this.vertexHandles[this.draggingHandleIndex!].position.set(point.x, 0.1, point.z);
      // Update all rooms that use this global vertex
      for (let roomIdx = 0; roomIdx < this.roomVertexIndices.length; roomIdx++) {
        if (this.roomVertexIndices[roomIdx].includes(globalIdx)) {
          this.updateRoomMeshAndWalls(roomIdx);
        }
      }
    }
  };

  private onHandlePointerUp = (event: PointerEvent) => {
    if (!this.editMode) return;
    this.draggingHandleIndex = null;
  }

  private animate = () => {
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
    this.animationId = requestAnimationFrame(this.animate);
  };

  private updateRoomMeshAndWalls(roomIndex: number) {
    const mesh = this.roomMeshes[roomIndex];
    const indices = this.roomVertexIndices[roomIndex];
    const verts = indices.map(idx => this.globalVertices[idx]);

    // Rebuild geometry in XY and keep the same Mesh instance
    const shape = new THREE.Shape(verts.map(v => new THREE.Vector2(v.x, -v.z)));
    const newGeometry = new THREE.ShapeGeometry(shape);

    // Update geometry in place (prevents duplicate meshes)
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = newGeometry;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;

    // Update handle positions if this is the currently edited room
    if (this.editingRoomIndex === roomIndex) {
      for (let i = 0; i < verts.length; i++) {
        this.vertexHandles[i].position.set(verts[i].x, 0.1, verts[i].z);
      }
    }

    // Regenerate walls for this room at the same index
    const oldWalls = this.allWallMeshes[roomIndex] ?? [];
    for (const wall of oldWalls) {
      this.scene.remove(wall);
      wall.geometry.dispose();
      (wall.material as THREE.Material).dispose();
    }
    this.allWallMeshes[roomIndex] = [];

    const roomColor = (mesh.material as THREE.MeshStandardMaterial).color.getHex();
    this.generateWallsForRoom(verts, roomColor, roomIndex);

    // Update area in metadata
    this.roomMetadata[roomIndex].area = this.calculatePolygonArea(verts);
  }

  public exportProject() {
    const data = {
      globalVertices: this.globalVertices,
      roomVertexIndices: this.roomVertexIndices,
      roomMetadata: this.roomMetadata
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
    for (const mesh of this.roomMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    for (const wallArr of this.allWallMeshes) {
      for (const wall of wallArr) {
        this.scene.remove(wall);
        wall.geometry.dispose();
        (wall.material as THREE.Material).dispose();
      }
    }
    this.roomMeshes = [];
    this.allWallMeshes = [];
    this.roomMetadata = [];
    this.globalVertices = [];
    this.roomVertexIndices = [];
    this.selectedRoomMesh = null;

    // Restore data
    this.globalVertices = data.globalVertices || [];
    this.roomVertexIndices = data.roomVertexIndices || [];
    this.roomMetadata = data.roomMetadata || [];

    // Rebuild meshes and walls
    for (let i = 0; i < this.roomVertexIndices.length; i++) {
      const indices = this.roomVertexIndices[i];
      const verts = indices.map(idx => this.globalVertices[idx]);
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
      this.scene.add(mesh);
      this.roomMeshes.push(mesh);
      this.generateWallsForRoom(verts, roomColor);
    }
    this.setCanvasListeners();
    this.cdr.detectChanges();
  }

  public saveProjectToServer() {
    const project: ProjectData = {
      title: 'My Project', // You can make this dynamic
      globalVertices: this.globalVertices,
      roomVertexIndices: this.roomVertexIndices,
      roomMetadata: this.roomMetadata
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
}
