import { Injectable, NgZone, ChangeDetectorRef } from '@angular/core';
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
    if (this.editorStateService.ctrlPressed || this.editorStateService.meshDrawingActive) return;
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
}