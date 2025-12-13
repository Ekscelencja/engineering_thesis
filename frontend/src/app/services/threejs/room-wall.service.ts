import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { EditorStateService } from './editor-state.service';
import { ThreeRenderService } from './three-render.service';
import { calculatePolygonArea, findOrAddGlobalVertex, clearDrawingVertexHighlights, canonicalWallKey } from '../../utils/geometry-utils';
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

  /**
   * Generate unique wall meshes for all rooms, merging features for shared walls.
   * @param allRooms Array of rooms, each with vertices and wallFeatures
   * @param roomColor Color for the walls
   */
  generateWallsForAllRooms(
    allRooms: { vertices: { x: number, z: number }[], wallFeatures?: WallFeature[][] }[],
    roomColor: number,
    wallHeight: number = this.wallHeight,
    wallThickness: number = this.wallThickness
  ): THREE.Mesh[] {
    const wallMeshes: THREE.Mesh[] = [];
    const wallSegments = new Map<string, { rooms: number[], wallIndices: number[][], features: WallFeature[][] }>();

    // 1. Collect all wall segments and their rooms
    allRooms.forEach((room, roomIdx) => {
      const verts = room.vertices;
      for (let i = 0; i < verts.length; i++) {
        const start = verts[i];
        const end = verts[(i + 1) % verts.length];
        const key = canonicalWallKey(start, end);
        if (!wallSegments.has(key)) {
          wallSegments.set(key, { rooms: [roomIdx], wallIndices: [[i]], features: [room.wallFeatures?.[i] || []] });
        } else {
          const seg = wallSegments.get(key)!;
          seg.rooms.push(roomIdx);
          seg.wallIndices.push([i]);
          seg.features.push(room.wallFeatures?.[i] || []);
        }
      }
    });

    // 2. Generate each unique wall mesh, merging features
    for (const [key, seg] of wallSegments.entries()) {
      // Only generate for one direction (e.g., if first room index is smallest)
      if (seg.rooms.length === 1 || seg.rooms[0] < seg.rooms[1]) {
        const [startStr, endStr] = key.split('|');
        const [x1, z1] = startStr.split(',').map(Number);
        const [x2, z2] = endStr.split(',').map(Number);
        const start = { x: x1, z: z1 };
        const end = { x: x2, z: z2 };

        // Merge features from all rooms sharing this wall
        const mergedFeatures = ([] as WallFeature[]).concat(...seg.features);

        // --- Wall mesh generation ---
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dz * dz);

        // Create wall shape with holes for features
        const shape = new THREE.Shape([
          new THREE.Vector2(0, 0),
          new THREE.Vector2(length, 0),
          new THREE.Vector2(length, wallHeight),
          new THREE.Vector2(0, wallHeight)
        ]);
        for (const f of mergedFeatures) {
          // Default baseHeight: window 1m, door 0m
          const baseHeight = f.type === 'window' ? 1 : 0;
          const hole = new THREE.Path();
          const x0 = f.position * length - f.width / 2;
          const x1 = f.position * length + f.width / 2;
          const y0 = baseHeight;
          const y1 = baseHeight + f.height;
          hole.moveTo(x0, y0);
          hole.lineTo(x1, y0);
          hole.lineTo(x1, y1);
          hole.lineTo(x0, y1);
          hole.lineTo(x0, y0);
          shape.holes.push(hole);
        }
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: wallThickness,
          bevelEnabled: false
        });

        const material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          side: THREE.DoubleSide
        });
        const wallMesh = new THREE.Mesh(geometry, material);

        // Position/orient along edge
        wallMesh.position.set(start.x, 0, start.z);
        const angle = Math.atan2(dz, dx);
        wallMesh.rotation.y = -angle;

        // Center thickness on the edge (mesh-level translation)
        wallMesh.translateZ(-wallThickness / 2);

        // IMPORTANT: UVs should be remapped in geometry space where Z ∈ [0, depth]
        this.remapWallUVsZeroToDepth(geometry, wallThickness);

        // Store metadata for per-wall tiling
        wallMesh.userData = {
          startV: start,
          endV: end,
          wallKey: key,
          wallHeight
        };

        wallMeshes.push(wallMesh);
      }
    }
    return wallMeshes;
  }

  // Proof-of-concept: update features for a wall and re-render
  updateWallFeatures(roomIdx: number, wallIdx: number, features: WallFeature[]) {
    const roomMeta = this.editorState.roomMetadata[roomIdx];
    if (!roomMeta.wallFeatures) roomMeta.wallFeatures = [];
    roomMeta.wallFeatures[wallIdx] = features;
    this.regenerateAllWalls();
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
    for (const wallArr of this.editorState.allWallMeshes) {
      for (const wall of wallArr) {
        this.threeRender.scene.remove(wall);
        wall.geometry.dispose();
        (wall.material as THREE.Material).dispose();
      }
    }
    // Remove metadata and indices
    this.editorState.roomMeshes.splice(idx, 1);
    this.editorState.roomMetadata.splice(idx, 1);
    this.editorState.roomVertexIndices.splice(idx, 1);
    this.editorState.selectedRoomMesh = null;
    this.regenerateAllWalls();
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

    this.regenerateAllWalls();

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
    }
    this.regenerateAllWalls();
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

    // Add metadata (now with color)
    this.editorState.roomMetadata.push({
      name: `Room ${this.editorState.roomMetadata.length + 1}`,
      type: 'Generic',
      area: calculatePolygonArea(verts),
      color: randomColor
    });

    this.regenerateAllWalls();

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

  // Helper to regenerate all deduplicated walls after any change
  regenerateAllWalls() {
    // Remove all current wall meshes from scene
    for (const wallArr of this.editorState.allWallMeshes) {
      for (const wall of wallArr) {
        this.threeRender.scene.remove(wall);
        wall.geometry.dispose();
        (wall.material as THREE.Material).dispose();
      }
    }
    this.editorState.allWallMeshes = [];

    // Prepare allRooms array
    const allRooms = this.editorState.roomMetadata.map((meta, idx) => ({
      vertices: this.editorState.roomVertexIndices[idx].map(i => this.editorState.globalVertices[i]),
      wallFeatures: meta.wallFeatures
    }));
    // Use color of first room or default
    const roomColor = this.editorState.roomMetadata[0]?.color ?? 0xcccccc;
    const newWallMeshes = this.generateWallsForAllRooms(allRooms, roomColor);
    this.editorState.allWallMeshes = [newWallMeshes];
    // Add to scene
    for (const wall of newWallMeshes) {
      this.threeRender.scene.add(wall);
    }
  }

  /** UVs for centered thickness: z spans [-t/2, +t/2] */
  remapWallUVsCentered(geometry: THREE.ExtrudeGeometry, wallThickness: number) {
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const uvArr = new Float32Array(pos.count * 2);
    const halfT = wallThickness / 2;
    const eps = 1e-5;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      let u: number;
      // Front/back faces: z ~ -halfT or +halfT
      if (Math.abs(z + halfT) < eps || Math.abs(z - halfT) < eps) {
        u = x;         // tile along wall length
      } else {
        u = z;         // tile along thickness
      }
      uvArr[i * 2 + 0] = u;
      uvArr[i * 2 + 1] = y; // height
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    geometry.attributes['uv'].needsUpdate = true;
  }

  remapWallUVsZeroToDepth(geometry: THREE.ExtrudeGeometry, wallThickness: number) {
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const uvArr = new Float32Array(pos.count * 2);
    const eps = 1e-5;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); // along wall length (local X)
      const y = pos.getY(i); // height
      const z = pos.getZ(i); // 0..wallThickness in geometry space

      // Front/back faces: z ≈ 0 or z ≈ wallThickness
      // Side faces: 0 < z < wallThickness
      let u: number, v: number;
      if (Math.abs(z) < eps || Math.abs(z - wallThickness) < eps) {
        // Front/back: tile by length (x) and height (y)
        u = x; v = y;
      } else {
        // Side: tile by thickness (z) and height (y)
        u = z; v = y;
      }

      uvArr[i * 2 + 0] = u;
      uvArr[i * 2 + 1] = v;
    }

    geometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    geometry.attributes['uv'].needsUpdate = true;
  }
}

