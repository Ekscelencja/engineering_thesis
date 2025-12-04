import { Injectable, NgZone } from '@angular/core';
import * as THREE from 'three';
import { EditorStateService } from './editor-state.service';
import { ThreeRenderService } from './three-render.service';
import { RoomWallService } from './room-wall.service';
import {
  isNearFirstVertex,
  getWorldXZFromPointer,
  updateDrawingLine,
  highlightDrawingVertex,
  clearDrawingVertexHighlights
} from '../../utils/geometry-utils';
import { WallFeature } from '../../models/room-feature.model';

@Injectable({ providedIn: 'root' })
export class EditorEventsService {
  private raycaster = new THREE.Raycaster();
  private canvasRef!: { nativeElement: HTMLCanvasElement };
  public get selectedRoomIndex(): number {
    const idx = this.editorStateService.selectedRoomMesh ? this.editorStateService.roomMeshes.indexOf(this.editorStateService.selectedRoomMesh) : -1;
    console.log('[DEBUG] selectedRoomIndex:', idx);
    return idx;
  }

  constructor(
    private ngZone: NgZone,
    private editorStateService: EditorStateService,
    private threeRenderService: ThreeRenderService,
    private roomWallService: RoomWallService
  ) { }

  /** Call this once after canvas is available */
  setCanvasRef(canvasRef: { nativeElement: HTMLCanvasElement }) {
    this.canvasRef = canvasRef;
  }

  setCanvasListeners() {
    this.deleteCanvasListeners();
    if (this.editorStateService.editMode) {
      this.canvasRef.nativeElement.addEventListener('pointerdown', this.onHandlePointerDown);
      this.canvasRef.nativeElement.addEventListener('pointermove', this.onHandlePointerMove);
      this.canvasRef.nativeElement.addEventListener('pointerup', this.onHandlePointerUp);
    } else if (this.editorStateService.meshDrawingActive) {
      this.canvasRef.nativeElement.addEventListener('pointerdown', this.onPointerDown);
    } else {
      this.canvasRef.nativeElement.addEventListener('pointerdown', this.onRoomSelect);
    }
  }

  deleteCanvasListeners() {
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onPointerDown);
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onRoomSelect);
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onHandlePointerDown);
    this.canvasRef.nativeElement.removeEventListener('pointermove', this.onHandlePointerMove);
    this.canvasRef.nativeElement.removeEventListener('pointerup', this.onHandlePointerUp);
  }

  onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Control') {
      this.editorStateService.ctrlPressed = true;
      if (this.editorStateService.ctrlPressed) this.threeRenderService.controls.enabled = true;
    }
    if (event.key === 'Delete') {
      this.roomWallService.deleteSelectedRoom();
    }
  };

  onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Control') {
      this.editorStateService.ctrlPressed = false;
      if (!this.editorStateService.ctrlPressed) this.threeRenderService.controls.enabled = false;
    }
  };

  onKeyPress = (event: KeyboardEvent) => {
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
        clearDrawingVertexHighlights(
          this.threeRenderService.scene,
          this.editorStateService.drawingVertexMeshes
        );
        this.editorStateService.isDrawing = false;
        this.editorStateService.drawingVertices = [];
      }
    }
    if (event.key === 'e' || event.key === 'E') {
      this.editorStateService.editMode = !this.editorStateService.editMode;
      this.setCanvasListeners();
      if (this.editorStateService.editMode && this.editorStateService.selectedRoomMesh) {
        this.editorStateService.editingRoomIndex = this.editorStateService.selectedRoomIndex;
        this.roomWallService.showVertexHandles(this.editorStateService.selectedRoomIndex ?? 0);
      } else {
        this.editorStateService.editingRoomIndex = null;
        this.roomWallService.hideVertexHandles();
      }
    }
  };

  onPointerDown = (event: PointerEvent) => {
    if (this.editorStateService.ctrlPressed || !this.editorStateService.meshDrawingActive) return;

    if (!this.editorStateService.isDrawing) {
      this.editorStateService.isDrawing = true;
      this.editorStateService.drawingVertices = [];
      clearDrawingVertexHighlights(
        this.threeRenderService.scene,
        this.editorStateService.drawingVertexMeshes
      );

      if (this.editorStateService.drawingLine) {
        this.threeRenderService.scene.remove(this.editorStateService.drawingLine);
        this.editorStateService.drawingLine.geometry.dispose();
        (this.editorStateService.drawingLine.material as THREE.Material).dispose();
        this.editorStateService.drawingLine = null;
      }
    }
    const point = getWorldXZFromPointer(
      event,
      this.canvasRef.nativeElement,
      this.threeRenderService.camera,
      this.raycaster
    );
    if (point) {
      if (
        this.editorStateService.drawingVertices.length >= 3 &&
        isNearFirstVertex(point, this.editorStateService.drawingVertices[0], 0.3)
      ) {
        this.roomWallService.closePolygon();
        return;
      }
      this.editorStateService.drawingVertices.push(point);
      highlightDrawingVertex(
        point,
        this.threeRenderService.scene,
        this.editorStateService.drawingVertexMeshes
      );
      this.editorStateService.drawingLine = updateDrawingLine(
        this.editorStateService.drawingVertices,
        this.threeRenderService.scene,
        this.editorStateService.drawingLine
      );
    }
  };

  onHandlePointerDown = (event: PointerEvent) => {
    if (!this.editorStateService.editMode) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.threeRenderService.camera);
    const intersects = this.raycaster.intersectObjects(this.editorStateService.vertexHandles);
    if (intersects.length > 0) {
      this.editorStateService.draggingHandleIndex = this.editorStateService.vertexHandles.indexOf(
        intersects[0].object as THREE.Mesh
      );
      event.preventDefault();
      event.stopPropagation();
    }
  };

  onHandlePointerMove = (event: PointerEvent) => {
    if (
      !this.editorStateService.editMode ||
      this.editorStateService.draggingHandleIndex === null
    )
      return;
    const point = getWorldXZFromPointer(
      event,
      this.canvasRef.nativeElement,
      this.threeRenderService.camera,
      this.raycaster
    );
    if (point) {
      const indices = this.editorStateService.roomVertexIndices[
        this.editorStateService.editingRoomIndex!
      ];
      if (!indices) return;
      const globalIdx = indices[this.editorStateService.draggingHandleIndex!];
      this.editorStateService.globalVertices[globalIdx] = { x: point.x, z: point.z };
      this.editorStateService.vertexHandles[
        this.editorStateService.draggingHandleIndex!
      ].position.set(point.x, 0.1, point.z);
      // Update all rooms that use this global vertex
      this.roomWallService.updateAllRoomsUsingVertex(globalIdx);
    }
  };

  onHandlePointerUp = (_event: PointerEvent) => {
    if (!this.editorStateService.editMode) return;
    this.editorStateService.draggingHandleIndex = null;
  };

  onRoomSelect = (event: PointerEvent) => {
    console.log('[onRoomSelect] called, placingFeatureType:', this.editorStateService.placingFeatureType);
    if (
      this.editorStateService.ctrlPressed ||
      this.editorStateService.meshDrawingActive ||
      this.editorStateService.placingFeatureType // Block selection if placing feature
    ) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.threeRenderService.camera);
    const intersects = this.raycaster.intersectObjects(this.editorStateService.roomMeshes);
    this.ngZone.run(() => {
      this.roomWallService.onRoomSelect(intersects, this.editorStateService.roomMeshes);
    });
  };

  handleWallClick(event: MouseEvent) {
    console.log('[handleWallClick] called, placingFeatureType:', this.editorStateService.placingFeatureType);

    if (!this.editorStateService.placingFeatureType) {
      // Not in placement mode, let room selection run
      this.onRoomSelect(event as any);
      return;
    }

    const canvas = this.canvasRef.nativeElement;
    const mouse = new THREE.Vector2(
      (event.offsetX / canvas.width) * 2 - 1,
      -(event.offsetY / canvas.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.threeRenderService.camera);

    // Flatten all wall meshes
    const wallMeshes = this.editorStateService.allWallMeshes.flat();
    const intersects = this.raycaster.intersectObjects(wallMeshes);

    console.log('[handleWallClick] wallMeshes:', wallMeshes.length, 'intersects:', intersects.length);

    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      // Use startV and endV from userData, not wallIdx!
      const { startV, endV } = mesh.userData;
      if (!startV || !endV) {
        console.warn('Wall mesh missing start/end vertices');
        return;
      }
      const point = intersects[0].point;
      const wallVec = new THREE.Vector2(endV.x - startV.x, endV.z - startV.z);
      const clickVec = new THREE.Vector2(point.x - startV.x, point.z - startV.z);
      const clickPosition = wallVec.length() > 0 ? (clickVec.dot(wallVec) / wallVec.lengthSq()) : 0.5;

      // Place the feature
      const feature = {
        type: this.editorStateService.placingFeatureType,
        position: clickPosition,
        width: this.editorStateService.placingFeatureType === 'window' ? 1 : 0.9,
        height: this.editorStateService.placingFeatureType === 'window' ? 1.2 : 2.0
      };

      // Find which room(s) share this wall and update their features
      // (You may need to search all rooms for the matching wall segment)
      // For now, update the selected room:
      const roomIdx = this.editorStateService.selectedRoomIndex;
      if (roomIdx == null) {
        console.warn('No room selected for feature placement');
        return;
      }
      const roomMeta = this.editorStateService.roomMetadata[roomIdx];
      if (!roomMeta.wallFeatures) roomMeta.wallFeatures = [];
      // Find the wall index in the selected room that matches startV/endV
      const verts = this.editorStateService.roomVertexIndices[roomIdx].map(idx => this.editorStateService.globalVertices[idx]);
      let wallIdx = -1;
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i], b = verts[(i + 1) % verts.length];
        if ((a.x === startV.x && a.z === startV.z && b.x === endV.x && b.z === endV.z) ||
          (a.x === endV.x && a.z === endV.z && b.x === startV.x && b.z === startV.z)) {
          wallIdx = i;
          break;
        }
      }
      if (wallIdx === -1) {
        console.warn('Could not find matching wall in selected room');
        return;
      }
      if (!roomMeta.wallFeatures[wallIdx]) roomMeta.wallFeatures[wallIdx] = [];
      roomMeta.wallFeatures[wallIdx].push(feature);

      this.roomWallService.updateWallFeatures(roomIdx, wallIdx, roomMeta.wallFeatures[wallIdx]);
      this.editorStateService.placingFeatureType = null; // Exit placement mode
      console.log('[handleWallClick] Feature placed:', feature);
    } else {
      console.log('[handleWallClick] No wall intersected');
    }
  }
}