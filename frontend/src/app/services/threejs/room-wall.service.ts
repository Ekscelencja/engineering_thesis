import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { EditorStateService } from './editor-state.service';
import { ThreeRenderService } from './three-render.service';
import { calculatePolygonArea, findOrAddGlobalVertex, clearDrawingVertexHighlights } from '../../utils/geometry-utils';

@Injectable({
  providedIn: 'root'
})
export class RoomWallService {
  wallHeight = 2.7;
  wallThickness = 0.2;

  constructor(
    private editorState: EditorStateService,
    private threeRender: ThreeRenderService
  ) {}

  // Generate wall meshes for a room
  generateWallsForRoom(
    vertices: { x: number, z: number }[],
    roomColor: number,
    wallHeight: number = this.wallHeight,
    wallThickness: number = this.wallThickness
  ): THREE.Mesh[] {
    const currentRoomWalls: THREE.Mesh[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const startV = vertices[i];
      const endV = vertices[(i + 1) % vertices.length];
      const dx = endV.x - startV.x;
      const dz = endV.z - startV.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);

      const wallGeometry = new THREE.BoxGeometry(length, wallHeight, wallThickness);
      const wallMaterial = new THREE.MeshStandardMaterial({ color: roomColor });
      const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);

      wallMesh.position.set(
        (startV.x + endV.x) / 2,
        wallHeight / 2,
        (startV.z + endV.z) / 2
      );
      wallMesh.rotation.y = -angle;

      this.threeRender.scene.add(wallMesh);
      currentRoomWalls.push(wallMesh);
    }
    return currentRoomWalls;
  }

  // Room selection logic
  onRoomSelect(intersects: THREE.Intersection[], roomMeshes: THREE.Mesh[]) {
    if (intersects.length > 0) {
      if (this.editorState.selectedRoomMesh) {
        (this.editorState.selectedRoomMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      }
      this.editorState.selectedRoomMesh = intersects[0].object as THREE.Mesh;
      (this.editorState.selectedRoomMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0xffff00);
    } else {
      if (this.editorState.selectedRoomMesh) {
        (this.editorState.selectedRoomMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        this.editorState.selectedRoomMesh = null;
      }
    }
  }

  deleteSelectedRoom() {
    const idx = this.editorState.roomMeshes.indexOf(this.editorState.selectedRoomMesh!);
    if (idx === -1) return;
    // Remove mesh and walls from scene
    this.threeRender.scene.remove(this.editorState.roomMeshes[idx]);
    for (const wall of this.editorState.allWallMeshes[idx]) {
      this.threeRender.scene.remove(wall);
      wall.geometry.dispose();
      (wall.material as THREE.Material).dispose();
    }
    // Remove metadata and indices
    this.editorState.roomMeshes.splice(idx, 1);
    this.editorState.allWallMeshes.splice(idx, 1);
    this.editorState.roomMetadata.splice(idx, 1);
    this.editorState.roomVertexIndices.splice(idx, 1);
    this.editorState.selectedRoomMesh = null;
  }

  showVertexHandles(roomIndex: number) {
    this.hideVertexHandles();
    const indices = this.editorState.roomVertexIndices[roomIndex];
    for (let i = 0; i < indices.length; i++) {
      const vIdx = indices[i];
      const v = this.editorState.globalVertices[vIdx];
      const geometry = new THREE.SphereGeometry(0.25, 16, 16);
      const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
      const handle = new THREE.Mesh(geometry, material);
      handle.position.set(v.x, 0.2, v.z);
      this.threeRender.scene.add(handle);
      this.editorState.vertexHandles.push(handle);
    }
  }

  hideVertexHandles() {
    for (const handle of this.editorState.vertexHandles) {
      this.threeRender.scene.remove(handle);
      handle.geometry.dispose();
      (handle.material as THREE.Material).dispose();
    }
    this.editorState.vertexHandles = [];
  }

  updateRoomMeshAndWalls(roomIndex: number) {
    // Remove old mesh and walls
    this.threeRender.scene.remove(this.editorState.roomMeshes[roomIndex]);
    for (const wall of this.editorState.allWallMeshes[roomIndex]) {
      this.threeRender.scene.remove(wall);
      wall.geometry.dispose();
      (wall.material as THREE.Material).dispose();
    }
    // Create new mesh and walls
    const indices = this.editorState.roomVertexIndices[roomIndex];
    const verts = indices.map(idx => this.editorState.globalVertices[idx]);
    const shape = new THREE.Shape(verts.map(v => new THREE.Vector2(v.x, -v.z)));
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.01;
    mesh.rotation.x = -Math.PI / 2; // Ensure floor is on XZ plane
    this.threeRender.scene.add(mesh);
    this.editorState.roomMeshes[roomIndex] = mesh;

    // Walls
    const walls = this.generateWallsForRoom(verts, 0x888888);
    this.editorState.allWallMeshes[roomIndex] = walls;

    // Update area
    this.editorState.roomMetadata[roomIndex].area = calculatePolygonArea(verts);
  }

  rebuildFromData(data: any) {
    // Clear existing scene
    for (const mesh of this.editorState.roomMeshes) {
      this.threeRender.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    for (const wallArr of this.editorState.allWallMeshes) {
      for (const wall of wallArr) {
        this.threeRender.scene.remove(wall);
        wall.geometry.dispose();
        (wall.material as THREE.Material).dispose();
      }
    }
    this.editorState.roomMeshes = [];
    this.editorState.allWallMeshes = [];
    this.editorState.roomMetadata = [];
    this.editorState.globalVertices = [];
    this.editorState.roomVertexIndices = [];

    // Restore from data
    this.editorState.globalVertices = data.globalVertices || [];
    this.editorState.roomVertexIndices = data.roomVertexIndices || [];
    this.editorState.roomMetadata = data.roomMetadata || [];

    for (let i = 0; i < this.editorState.roomVertexIndices.length; i++) {
      const indices = this.editorState.roomVertexIndices[i];
      const verts = indices.map(idx => this.editorState.globalVertices[idx]);
      const shape = new THREE.Shape(verts.map(v => new THREE.Vector2(v.x, -v.z)));
      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = 0.01;
      mesh.rotation.x = -Math.PI / 2; // Ensure floor is on XZ plane
      this.threeRender.scene.add(mesh);
      this.editorState.roomMeshes.push(mesh);

      const walls = this.generateWallsForRoom(verts, 0x888888);
      this.editorState.allWallMeshes.push(walls);
    }
  }

  // Handles completion of a polygon (room)
  closePolygon() {
    if (this.editorState.drawingVertices.length < 3) return;

    // Add vertices to global list and get their indices
    const indices: number[] = [];
    for (const v of this.editorState.drawingVertices) {
      const idx = findOrAddGlobalVertex(v, this.editorState.globalVertices);
      indices.push(idx);
    }
    this.editorState.roomVertexIndices.push(indices);

    // Create mesh
    const verts = indices.map(idx => this.editorState.globalVertices[idx]);
    const shape = new THREE.Shape(verts.map(v => new THREE.Vector2(v.x, -v.z)));
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.01;
    mesh.rotation.x = -Math.PI / 2; // Ensure floor is on XZ plane
    this.threeRender.scene.add(mesh);
    this.editorState.roomMeshes.push(mesh);

    // Create walls
    const walls = this.generateWallsForRoom(verts, 0x888888);
    this.editorState.allWallMeshes.push(walls);

    // Add metadata
    this.editorState.roomMetadata.push({
      name: `Room ${this.editorState.roomMetadata.length + 1}`,
      type: 'Generic',
      area: calculatePolygonArea(verts)
    });

    // Reset drawing state
    this.editorState.isDrawing = false;
    this.editorState.drawingVertices = [];
    if (this.editorState.drawingLine) {
      this.threeRender.scene.remove(this.editorState.drawingLine);
      this.editorState.drawingLine.geometry.dispose();
      (this.editorState.drawingLine.material as THREE.Material).dispose();
      this.editorState.drawingLine = null;
    }
    clearDrawingVertexHighlights(this.threeRender.scene, this.editorState.drawingVertexMeshes);
  }
}