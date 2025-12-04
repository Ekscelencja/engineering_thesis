
import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { EditorStateService } from './editor-state.service';
import { ThreeRenderService } from './three-render.service';
import { calculatePolygonArea, findOrAddGlobalVertex, clearDrawingVertexHighlights } from '../../utils/geometry-utils';
import { WallFeature } from '../../models/room-feature.model';

@Injectable({
  providedIn: 'root'
})
export class RoomWallService {
  wallHeight = 2.7;
  wallThickness = 0.2;

  constructor(
    private editorState: EditorStateService,
    private threeRender: ThreeRenderService
  ) { }

  // Generate wall meshes for a room
  generateWallsForRoom(
    vertices: { x: number, z: number }[],
    roomColor: number,
    wallHeight: number = this.wallHeight,
    wallThickness: number = this.wallThickness,
    wallFeatures?: WallFeature[][]
  ): THREE.Mesh[] {
    const currentRoomWalls: THREE.Mesh[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const startV = vertices[i];
      const endV = vertices[(i + 1) % vertices.length];
      const dx = endV.x - startV.x;
      const dz = endV.z - startV.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);

      // Wall shape with optional holes for features
      const shape = new THREE.Shape([
        new THREE.Vector2(0, 0),
        new THREE.Vector2(length, 0),
        new THREE.Vector2(length, wallHeight),
        new THREE.Vector2(0, wallHeight)
      ]);
      if (wallFeatures && wallFeatures[i]) {
        for (const f of wallFeatures[i]) {
          const hole = new THREE.Path();
          const x0 = f.position * length - f.width / 2;
          const x1 = f.position * length + f.width / 2;
          const y0 = 0.5;
          const y1 = 0.5 + f.height;
          hole.moveTo(x0, y0);
          hole.lineTo(x1, y0);
          hole.lineTo(x1, y1);
          hole.lineTo(x0, y1);
          hole.lineTo(x0, y0);
          shape.holes.push(hole);
        }
      }
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: wallThickness, bevelEnabled: false });
      geometry.translate(0, 0, -wallThickness / 2);

      const material = new THREE.MeshStandardMaterial({ color: roomColor });
      const wallMesh = new THREE.Mesh(geometry, material);

      // Place at start vertex
      wallMesh.position.set(startV.x, 0, startV.z);

      // Rotate to align with wall direction
      wallMesh.rotation.y = -angle;

      // Store wall index for identification
      (wallMesh as any).userData = { wallIdx: i };

      this.threeRender.scene.add(wallMesh);
      currentRoomWalls.push(wallMesh);
    }
    return currentRoomWalls;
  }

  // Proof-of-concept: update features for a wall and re-render
  updateWallFeatures(roomIdx: number, wallIdx: number, features: WallFeature[]) {
    const roomMeta = this.editorState.roomMetadata[roomIdx];
    if (!roomMeta.wallFeatures) roomMeta.wallFeatures = [];
    roomMeta.wallFeatures[wallIdx] = features;
    // Re-generate all walls for this room
    const verts = this.editorState.roomVertexIndices[roomIdx].map(idx => this.editorState.globalVertices[idx]);
    const color = roomMeta.color ?? 0xcccccc;
    // Remove old walls
    for (const wall of this.editorState.allWallMeshes[roomIdx] || []) {
      this.threeRender.scene.remove(wall);
      wall.geometry.dispose();
      (wall.material as THREE.Material).dispose();
    }
    // Create new walls with features
    const walls = this.generateWallsForRoom(verts, color, this.wallHeight, this.wallThickness, roomMeta.wallFeatures);
    this.editorState.allWallMeshes[roomIdx] = walls;
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
    // --- Update only geometry, not mesh/material ---
    const mesh = this.editorState.roomMeshes[roomIndex];
    const indices = this.editorState.roomVertexIndices[roomIndex];
    const verts = indices.map(idx => this.editorState.globalVertices[idx]);
    const shape = new THREE.Shape(verts.map(v => new THREE.Vector2(v.x, -v.z)));
    const newGeometry = new THREE.ShapeGeometry(shape);

    // Update geometry in place
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = newGeometry;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.01;

    // Update handle positions if this is the currently edited room
    if (this.editorState.editingRoomIndex === roomIndex) {
      for (let i = 0; i < verts.length; i++) {
        if (this.editorState.vertexHandles[i]) {
          this.editorState.vertexHandles[i].position.set(verts[i].x, 0.1, verts[i].z);
        }
      }
    }

    // Update color if needed
    const roomColor = this.editorState.roomMetadata[roomIndex]?.color ?? 0xcccccc;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(roomColor);

    // Highlight if selected
    if (this.editorState.selectedRoomIndex === roomIndex) {
      mat.emissive.setHex(0xffff00);
    } else {
      mat.emissive.setHex(0x000000);
    }
    mat.needsUpdate = true;

    // --- Remove old walls before creating new ones ---
    for (const wall of this.editorState.allWallMeshes[roomIndex] || []) {
      this.threeRender.scene.remove(wall);
      wall.geometry.dispose();
      (wall.material as THREE.Material).dispose();
    }
    this.editorState.allWallMeshes[roomIndex] = [];

    // --- Always create new wall meshes for this room only ---
    const walls = this.generateWallsForRoom(verts, roomColor, this.wallHeight, this.wallThickness, this.editorState.roomMetadata[roomIndex]?.wallFeatures);
    this.editorState.allWallMeshes[roomIndex] = walls;

    // Update area
    this.editorState.roomMetadata[roomIndex].area = calculatePolygonArea(verts);
  }

  // Update all rooms that use a given global vertex index
  updateAllRoomsUsingVertex(globalVertexIdx: number) {
    for (let roomIdx = 0; roomIdx < this.editorState.roomVertexIndices.length; roomIdx++) {
      if (this.editorState.roomVertexIndices[roomIdx].includes(globalVertexIdx)) {
        console.log(`Updating room ${roomIdx} due to vertex ${globalVertexIdx} change`);
        this.updateRoomMeshAndWalls(roomIdx);
      }
    }
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
    this.editorState.selectedRoomMesh = null;

    // Restore from data
    this.editorState.globalVertices = data.globalVertices || [];
    this.editorState.roomVertexIndices = data.roomVertexIndices || [];
    this.editorState.roomMetadata = data.roomMetadata || [];

    for (let i = 0; i < this.editorState.roomVertexIndices.length; i++) {
      const indices = this.editorState.roomVertexIndices[i];
      const verts = indices.map(idx => this.editorState.globalVertices[idx]);
      const shape = new THREE.Shape(verts.map(v => new THREE.Vector2(v.x, -v.z)));
      const geometry = new THREE.ShapeGeometry(shape);
      const roomColor = this.editorState.roomMetadata[i]?.color ?? 0xcccccc;
      const material = new THREE.MeshStandardMaterial({ color: roomColor, side: THREE.DoubleSide, emissive: 0x000000 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = 0.01;
      mesh.rotation.x = -Math.PI / 2; // Ensure floor is on XZ plane
      this.threeRender.scene.add(mesh);
      this.editorState.roomMeshes.push(mesh);

      // Always create new wall meshes for each room
      const walls = this.generateWallsForRoom(verts, roomColor, this.wallHeight, this.wallThickness, this.editorState.roomMetadata[i]?.wallFeatures);
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
    const randomColor = Math.floor(Math.random() * 0xffffff);
    const material = new THREE.MeshStandardMaterial({ color: randomColor, side: THREE.DoubleSide, emissive: 0x000000 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.01;
    mesh.rotation.x = -Math.PI / 2; // Ensure floor is on XZ plane
    this.threeRender.scene.add(mesh);
    this.editorState.roomMeshes.push(mesh);

    // Always create new wall meshes for this room
    const walls = this.generateWallsForRoom(verts, randomColor, this.wallHeight, this.wallThickness);
    this.editorState.allWallMeshes.push(walls);

    // Add metadata (now with color)
    this.editorState.roomMetadata.push({
      name: `Room ${this.editorState.roomMetadata.length + 1}`,
      type: 'Generic',
      area: calculatePolygonArea(verts),
      color: randomColor
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