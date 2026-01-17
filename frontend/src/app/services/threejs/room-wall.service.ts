import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { EditorStateService } from './editor-state.service';
import { ThreeRenderService } from './three-render.service';
import { calculatePolygonArea, findOrAddGlobalVertex, clearDrawingVertexHighlights, canonicalWallKey } from '../../utils/geometry-utils';
import { WallFeature, WallSide, sideMap } from '../../models/room-feature.model';
import { FurnitureService } from './furniture.service';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

@Injectable({
  providedIn: 'root'
})
export class RoomWallService {
  wallHeight = 2.7;
  wallThickness = 0.2;

  constructor(
    private editorState: EditorStateService,
    private threeRender: ThreeRenderService,
    private furnitureService: FurnitureService
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

        // Compute normals for face detection
        geometry.computeVertexNormals();

        // --- Create materials for all possible faces ---
        // 0: front, 1: back, 2: sides (left/right edges), 3: top, 4: bottom, 5: hole edges
        const materialFront = new THREE.MeshStandardMaterial({ color: 0xcccccc });  // RED: front
        const materialBack = new THREE.MeshStandardMaterial({ color: 0xcccccc });   // GREEN: back
        const materialSide = new THREE.MeshStandardMaterial({ color: 0xcccccc });   // BLUE: sides
        const materialTop = new THREE.MeshStandardMaterial({ color: 0xcccccc });    // YELLOW: top
        const materialBottom = new THREE.MeshStandardMaterial({ color: 0xcccccc }); // CYAN: bottom
        const materialHole = new THREE.MeshStandardMaterial({ color: 0xcccccc });   // MAGENTA: hole edges

        // Convert to non-indexed and rebuild groups per triangle based on face normal
        geometry.toNonIndexed();
        geometry.clearGroups();

        const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
        const triCount = pos.count / 3;
        const eps = 1e-4;
        const wallH = wallHeight;
        const wallT = wallThickness;

        for (let t = 0; t < triCount; t++) {
          const i0 = t * 3;
          const i1 = t * 3 + 1;
          const i2 = t * 3 + 2;

          // Get triangle vertices
          const v0 = new THREE.Vector3(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
          const v1 = new THREE.Vector3(pos.getX(i1), pos.getY(i1), pos.getZ(i1));
          const v2 = new THREE.Vector3(pos.getX(i2), pos.getY(i2), pos.getZ(i2));

          // Compute face normal
          const edge1 = new THREE.Vector3().subVectors(v1, v0);
          const edge2 = new THREE.Vector3().subVectors(v2, v0);
          const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

          let materialIndex = 2; // default to side

          // Check face orientation based on normal
          if (Math.abs(normal.z) > 0.9) {
            // Front or back face
            if (normal.z > 0) {
              materialIndex = 1; // back (z+)
            } else {
              materialIndex = 0; // front (z-)
            }
          } else if (Math.abs(normal.y) > 0.9) {
            // Top or bottom face
            if (normal.y > 0) {
              materialIndex = 3; // top
            } else {
              materialIndex = 4; // bottom
            }
          } else if (Math.abs(normal.x) > 0.9) {
            // Left or right wall edge (side)
            materialIndex = 2; // side
          } else {
            // Angled face - likely a hole edge
            // Check if all vertices are between 0 and wallThickness in Z
            const allInside = [v0, v1, v2].every(v => v.z > eps && v.z < wallT - eps);
            if (allInside) {
              materialIndex = 5; // hole edge
            } else {
              materialIndex = 2; // side
            }
          }

          geometry.addGroup(i0, 3, materialIndex);
        }

        const wallMesh = new THREE.Mesh(geometry, [
          materialFront,   // 0
          materialBack,    // 1
          materialSide,    // 2
          materialTop,     // 3
          materialBottom,  // 4
          materialHole     // 5
        ]);

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

        const gltfLoader = new GLTFLoader();

        for (const f of mergedFeatures) {
          const isWindow = f.type === 'window';
          const modelPath = isWindow
            ? 'assets/3d_door_window/window.glb'
            : 'assets/3d_door_window/door.glb';

          gltfLoader.load(modelPath, (gltf) => {
            const model = gltf.scene;

            // Compute bounding box of model
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);

            // Feature dimensions
            const featureWidth = f.width;
            const featureHeight = f.height;
            const featureDepth = wallThickness;

            // Avoid division by zero
            const safeSizeX = size.x || 1;
            const safeSizeY = size.y || 1;

            // For doors: scale by width and height only
            let scale;
            if (!isWindow) {
              scale = Math.min(featureWidth / safeSizeX, featureHeight / safeSizeY);
              model.scale.setScalar(scale);
            } else {
              // For windows: use previous uniform scaling
              const scaleX = featureWidth / safeSizeX;
              const scaleY = featureHeight / safeSizeY;
              model.scale.set(scaleX, scaleY, scaleX); // Use scaleX for depth to maintain proportions
            }

            // Recompute bounding box after scaling
            const scaledBox = new THREE.Box3().setFromObject(model);

            // Position model at hole center, base aligned
            const wallLength = length;
            const xCenter = f.position * wallLength;
            const baseHeight = isWindow ? 1 : 0;
            const minY = scaledBox.min.y;
            const yCenter = baseHeight - minY;
            const zCenter = wallThickness / 2;

            model.position.set(xCenter, yCenter, zCenter);

            // For doors: rotate by 90° around Y to match wall orientation
            if (!isWindow) {
              model.rotation.y = Math.PI / 2;
            } else {
              // For windows: determine which side faces inward
              // Compute wall direction and normal
              const wallDir = new THREE.Vector3(dx, 0, dz).normalize();
              const wallNormal = new THREE.Vector3(-dz, 0, dx).normalize(); // Perpendicular to wall

              // Determine which room this feature belongs to
              const featureListIndex = seg.features.findIndex(list => list.includes(f));
              const roomIdx = seg.rooms[featureListIndex];
              const roomVerts = allRooms[roomIdx].vertices;

              // Compute room centroid
              let cx = 0, cz = 0;
              for (const v of roomVerts) {
                cx += v.x;
                cz += v.z;
              }
              cx /= roomVerts.length;
              cz /= roomVerts.length;

              // Vector from wall midpoint to room centroid
              const wallMidX = (start.x + end.x) / 2;
              const wallMidZ = (start.z + end.z) / 2;
              const toRoom = new THREE.Vector3(cx - wallMidX, 0, cz - wallMidZ).normalize();

              // If wall normal points away from room, flip window
              const dot = wallNormal.dot(toRoom);
              model.rotation.y = dot < 0 ? Math.PI : 0;
            }

            wallMesh.add(model);
          });
        }

        wallMeshes.push(wallMesh);
      }
    }
    return wallMeshes;
  }

  /**
   * Update wall features for a specific wall in a room and regenerate walls.
   * @param roomIdx 
   * @param wallIdx 
   * @param features 
   */
  updateWallFeatures(roomIdx: number, wallIdx: number, features: WallFeature[]) {
    const roomMeta = this.editorState.roomMetadata[roomIdx];
    if (!roomMeta.wallFeatures) roomMeta.wallFeatures = [];
    roomMeta.wallFeatures[wallIdx] = features;
    this.regenerateAllWalls();
  }

  /**
   * Regenerate all walls in the scene based on current editor state.
   * @param intersects 
   * @param roomMeshes 
   */
  onRoomSelect(intersects: THREE.Intersection[], roomMeshes: THREE.Mesh[]) {
    if (intersects.length > 0) {
      const prevIdx = this.editorState.selectedRoomIndex;
      if (prevIdx !== -1) {
        const prevMesh = this.editorState.roomMeshes[prevIdx];
        (prevMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      }
      const mesh = intersects[0].object as THREE.Mesh;
      const idx = this.editorState.roomMeshes.indexOf(mesh);
      if (idx !== -1) {
        this.editorState.selectedRoomIndex = idx;
        (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0xffff00);
      }
    } else {
      const prevIdx = this.editorState.selectedRoomIndex;
      if (prevIdx !== -1) {
        const prevMesh = this.editorState.roomMeshes[prevIdx];
        (prevMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      }
      this.editorState.selectedRoomIndex = -1;
    }
  }

  /**
   * Delete the currently selected room and its walls.
   */ 
  deleteSelectedRoom() {
    const idx = this.editorState.selectedRoomIndex;
    if (idx === -1) return;
    // Remove mesh and walls from scene
    this.threeRender.scene.remove(this.editorState.roomMeshes[idx]);
    for (const wallArr of this.editorState.allWallMeshes) {
      for (const wall of wallArr) {
        this.threeRender.scene.remove(wall);
        wall.geometry.dispose();
        if (Array.isArray(wall.material)) {
          wall.material.forEach(mat => mat.dispose());
        } else {
          (wall.material as THREE.Material).dispose();
        }
      }
    }
    // Remove metadata and indices
    this.editorState.roomMeshes.splice(idx, 1);
    this.editorState.roomMetadata.splice(idx, 1);
    this.editorState.roomVertexIndices.splice(idx, 1);
    this.editorState.selectedRoomIndex = -1;
    this.regenerateAllWalls();
  }

  /**
   * Regenerate all walls in the scene based on current editor state.
   * @param roomColor 
   */  
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

  /**
   * Hide and dispose all vertex handles.
   */
  hideVertexHandles() {
    for (const handle of this.editorState.vertexHandles) {
      this.threeRender.scene.remove(handle);
      handle.geometry.dispose();
      (handle.material as THREE.Material).dispose();
    }
    this.editorState.vertexHandles = [];
  }

  /**
   * Update the mesh and wall meshes for a specific room.
   * @param roomIndex 
   */
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

    // Update area
    this.editorState.roomMetadata[roomIndex].area = calculatePolygonArea(verts);

    // Notify metadata change
    this.editorState.emitRoomMetadataChanged();
  }

  /**
   * Update all rooms that use a specific global vertex index.
   * @param globalVertexIdx 
   */
  updateAllRoomsUsingVertex(globalVertexIdx: number) {
    for (let roomIdx = 0; roomIdx < this.editorState.roomVertexIndices.length; roomIdx++) {
      if (this.editorState.roomVertexIndices[roomIdx].includes(globalVertexIdx)) {
        this.updateRoomMeshAndWalls(roomIdx);
      }
    }
  }

  /**
   * Rebuild the entire scene from imported data.
   * @param data 
   */
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
        if (Array.isArray(wall.material)) {
          wall.material.forEach(mat => mat.dispose());
        } else {
          (wall.material as THREE.Material).dispose();
        }
      }
    }
    this.editorState.roomMeshes = [];
    this.editorState.allWallMeshes = [];
    this.editorState.roomMetadata = [];
    this.editorState.globalVertices = [];
    this.editorState.roomVertexIndices = [];
    this.editorState.selectedRoomIndex = -1;

    // Restore from data
    this.editorState.globalVertices = data.globalVertices || [];
    this.editorState.roomVertexIndices = data.roomVertexIndices || [];
    this.editorState.roomMetadata = data.roomMetadata || [];

    // Restore wallAppearance from data
    this.editorState.wallAppearance = data.wallAppearance || {};

    // Restore floorAppearance from data
    this.editorState.floorAppearance = data.floorAppearance || {};

    for (let i = 0; i < this.editorState.roomVertexIndices.length; i++) {
      const indices = this.editorState.roomVertexIndices[i];
      const verts = indices.map(idx => this.editorState.globalVertices[idx]);
      const shape = new THREE.Shape(verts.map(v => new THREE.Vector2(v.x, -v.z)));
      const geometry = new THREE.ShapeGeometry(shape);
      const roomColor = this.editorState.roomMetadata[i]?.color ?? 0xcccccc;
      const material = new THREE.MeshStandardMaterial({ color: roomColor, side: THREE.DoubleSide, emissive: 0x000000 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = 0.02;
      mesh.rotation.x = -Math.PI / 2; // Ensure floor is on XZ plane
      this.threeRender.scene.add(mesh);
      this.editorState.roomMeshes.push(mesh);

      // After mesh is created and added to scene:
      const roomKey = i.toString();
      const appearance = this.editorState.floorAppearance[roomKey];
      if (appearance) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (appearance.color) mat.color = new THREE.Color(appearance.color);
        if (appearance.texture) {
          const texLoader = new THREE.TextureLoader();
          const url = `assets/textures/floors/${appearance.texture}.jpg`;
          const tex = texLoader.load(url);
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          mat.map = tex;
          mat.color = new THREE.Color(0xffffff);
        }
        mat.needsUpdate = true;
      }
    }
    if (this.editorState.editorStep > 1) {
      this.regenerateAllWalls();
    }
  }

  /**
   * Finalize the currently drawn polygon as a room.
   */
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
    mesh.position.y = 0.02;
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

  /**
   * Regenerate all walls in the scene based on current editor state.
   */
  regenerateAllWalls() {
    // Remove all current wall meshes from scene
    for (const wallArr of this.editorState.allWallMeshes) {
      for (const wall of wallArr) {
        this.threeRender.scene.remove(wall);
        wall.geometry.dispose();
        if (Array.isArray(wall.material)) {
          wall.material.forEach(mat => mat.dispose());
        } else {
          (wall.material as THREE.Material).dispose();
        }
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

    // Apply saved wallAppearance by wallKey ---
    const wallAppearance = this.editorState.wallAppearance;
    for (const [wallKey, appearance] of Object.entries(wallAppearance)) {
      const wall = newWallMeshes.find(w => w.userData['wallKey'] === wallKey);
      if (!wall) continue;
      for (const [side, data] of Object.entries(appearance)) {
        if (!sideMap.hasOwnProperty(side)) continue;
        const mat = (wall.material as THREE.Material[])[sideMap[side as WallSide]] as THREE.MeshStandardMaterial;
        if (data.color) { mat.color = new THREE.Color(data.color); }
        if (data.texture) {
          const texLoader = new THREE.TextureLoader();
          const url = `assets/textures/walls/${data.texture}.jpg`;
          const tex = texLoader.load(url);
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          mat.map = tex;
        }
        mat.needsUpdate = true;
      }
    }
  }

  /** 
   * Hide all wall meshes from the scene.
   */
  hideAllWalls() {
    for (const wallArr of this.editorState.allWallMeshes) {
      for (const wall of wallArr) {
        this.threeRender.scene.remove(wall);
      }
    }
  }

  /** 
   * Remap wall UVs so that V coordinate goes from 0 to depth along Z axis.
   * @param geometry
   * @param wallThickness
   */
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

  /**
   * Get wall index in the allWallMeshes array by its mesh reference.
   * @param wall 
   * @returns 
   */
  getWallIndexByMesh(wall: THREE.Mesh): number {
    const allWalls = this.editorState.allWallMeshes.flat();
    return allWalls.indexOf(wall);
  }

  /** 
   * Apply color to a specific wall mesh side and persist in editor state.
   * @param wall
   * @param colorHex
   * @param side
   */
  applyWallColorToMesh(wall: THREE.Mesh, colorHex: string, side: 'front' | 'back' | 'side' | 'top' | 'bottom' | 'hole') {
    const mat = (wall.material as THREE.Material[])[sideMap[side as WallSide]] as THREE.MeshStandardMaterial;
    mat.color = new THREE.Color(colorHex);
    mat.needsUpdate = true;

    const wallKey = wall.userData['wallKey'];
    if (wallKey) {
      if (!this.editorState.wallAppearance[wallKey]) this.editorState.wallAppearance[wallKey] = {};
      this.editorState.wallAppearance[wallKey][side] = {
        ...this.editorState.wallAppearance[wallKey][side],
        color: colorHex
      };
    }
  }

  /** 
   * Apply texture to a specific wall mesh side and persist in editor state.
   * @param wall
   * @param textureId
   * @param side
   */
  applyWallTextureToMesh(wall: THREE.Mesh, textureId: string | null, side: 'front' | 'back' | 'side' | 'top' | 'bottom' | 'hole') {
    const mat = (wall.material as THREE.Material[])[sideMap[side as WallSide]] as THREE.MeshStandardMaterial;
    if (!textureId) {
      mat.map = null;
    } else {
      const texLoader = new THREE.TextureLoader();
      const url = `assets/textures/walls/${textureId}.jpg`;
      const tex = texLoader.load(url);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      mat.map = tex;
    }
    mat.needsUpdate = true;

    const wallKey = wall.userData['wallKey'];
    if (wallKey) {
      if (!this.editorState.wallAppearance[wallKey]) this.editorState.wallAppearance[wallKey] = {};
      this.editorState.wallAppearance[wallKey][side] = {
        ...this.editorState.wallAppearance[wallKey][side],
        texture: textureId || ''
      };
    }
  }

  /** 
   * Apply color to a room floor mesh and persist in editor state.
   * @param roomMesh
   * @param colorHex
   * @param roomKey
   */
  applyFloorColorToMesh(roomMesh: THREE.Mesh, colorHex: string, roomKey: string) {
    const mat = roomMesh.material as THREE.MeshStandardMaterial;
    mat.color = new THREE.Color(colorHex);
    mat.needsUpdate = true;
    this.editorState.floorAppearance[roomKey] = {
      ...this.editorState.floorAppearance[roomKey],
      color: colorHex
    };
  }

  /** 
   * Apply texture to a room floor mesh and persist in editor state.
   * @param roomMesh
   * @param textureId
   * @param roomKey
   */ 
  applyFloorTextureToMesh(roomMesh: THREE.Mesh, textureId: string | null, roomKey: string) {
    const mat = roomMesh.material as THREE.MeshStandardMaterial;
    if (!textureId) {
      mat.map = null;
    } else {
      const texLoader = new THREE.TextureLoader();
      const url = `assets/textures/floors/${textureId}.jpg`;
      const tex = texLoader.load(
        url,
        undefined,
        (err) => {
          console.error('Texture load error:', url, err);
          // Optionally set a fallback color or texture here
        }
      );
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      mat.map = tex;
      mat.color = new THREE.Color(0xffffff);
    }
    mat.needsUpdate = true;
    this.editorState.floorAppearance[roomKey] = {
      ...this.editorState.floorAppearance[roomKey],
      texture: textureId || ''
    };
  }

  /** 
   * Delete the currently selected furniture item from the scene and editor state.
   */
  deleteSelectedFurniture() {
    const idx = this.editorState.selectedFurnitureIndex;
    if (idx == null || idx < 0) return;
    const furniture = this.editorState.placedFurnitures[idx];

    // Remove mesh and all its children from the scene, no matter where they are parented
    furniture.mesh.traverse(child => {
      if (child.parent && child.parent.type === 'Scene') {
        child.parent.remove(child);
      }
    });
    // Also remove the root mesh from its parent (if not already removed)
    if (furniture.mesh.parent) {
      furniture.mesh.parent.remove(furniture.mesh);
    }

    // Dispose all geometries/materials in the group
    furniture.mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });

    // Remove from array and clear selection
    this.editorState.placedFurnitures.splice(idx, 1);
    this.editorState.selectedFurnitureIndex = null;

    // Force a render update
    this.threeRender.renderer?.render(
      this.threeRender.scene,
      this.threeRender.camera
    );
  }
}

