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
import { WallSide } from '../../models/room-feature.model';

@Injectable({ providedIn: 'root' })
export class EditorEventsService {
  private raycaster = new THREE.Raycaster();
  private canvasRef!: { nativeElement: HTMLCanvasElement };
  private previewMesh: THREE.Mesh | null = null;
  private lastPreviewWall: THREE.Mesh | null = null;
  private lastPreviewPosition: THREE.Vector3 | null = null;
  private lastPreviewRotationY: number = 0;
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
      if (this.editorStateService.editorStep > 1) return;
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
      this.editorStateService.placingFeatureType
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

  selectWall(wall: THREE.Mesh | null) {
    if (this.editorStateService.selectedWall) {
      const prev = this.editorStateService.selectedWall;
      if (prev.userData['outlineMesh']) {
        prev.remove(prev.userData['outlineMesh']);
        prev.userData['outlineMesh'].geometry.dispose();
        prev.userData['outlineMesh'].material.dispose();
        prev.userData['outlineMesh'] = undefined;
      }
    }
    this.editorStateService.selectedWall = wall;

    if (wall) {
      const outlineMat = new THREE.MeshBasicMaterial({
        color: 0xffff66,
        side: THREE.BackSide
      });
      const outlineMesh = new THREE.Mesh(wall.geometry.clone(), outlineMat);
      outlineMesh.scale.multiplyScalar(1.05);
      wall.add(outlineMesh);
      wall.userData['outlineMesh'] = outlineMesh;
    }
  }

  handleWallClick(event: MouseEvent) {
    const canvas = this.canvasRef.nativeElement;
    const mouse = new THREE.Vector2(
      (event.offsetX / canvas.width) * 2 - 1,
      -(event.offsetY / canvas.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.threeRenderService.camera);

    const wallMeshes = this.editorStateService.allWallMeshes.flat();
    const intersects = this.raycaster.intersectObjects(wallMeshes, false);

    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh;

      if (this.editorStateService.placingFeatureType) {
        const { startV, endV } = mesh.userData;
        if (!startV || !endV) {
          console.warn('Wall mesh missing start/end vertices');
          return;
        }
        const point = intersects[0].point;
        const wallVec = new THREE.Vector2(endV.x - startV.x, endV.z - startV.z);
        const clickVec = new THREE.Vector2(point.x - startV.x, point.z - startV.z);
        const clickPosition = wallVec.length() > 0 ? (clickVec.dot(wallVec) / wallVec.lengthSq()) : 0.5;

        for (let roomIdx = 0; roomIdx < this.editorStateService.roomVertexIndices.length; roomIdx++) {
          const verts = this.editorStateService.roomVertexIndices[roomIdx].map(
            idx => this.editorStateService.globalVertices[idx]
          );
          for (let i = 0; i < verts.length; i++) {
            const a = verts[i], b = verts[(i + 1) % verts.length];
            if (
              (a.x === startV.x && a.z === startV.z && b.x === endV.x && b.z === endV.z) ||
              (a.x === endV.x && a.z === endV.z && b.x === startV.x && b.z === startV.z)
            ) {
              const feature = {
                type: this.editorStateService.placingFeatureType,
                position: clickPosition,
                width: this.editorStateService.placingFeatureType === 'window' ? 1 : 0.9,
                height: this.editorStateService.placingFeatureType === 'window' ? 1.2 : 2.0
              };
              const roomMeta = this.editorStateService.roomMetadata[roomIdx];
              if (!roomMeta.wallFeatures) roomMeta.wallFeatures = [];
              if (!roomMeta.wallFeatures[i]) roomMeta.wallFeatures[i] = [];
              roomMeta.wallFeatures[i].push(feature);
              this.roomWallService.updateWallFeatures(roomIdx, i, roomMeta.wallFeatures[i]);
            }
          }
        }
        this.disposeFeaturePreview();
        this.editorStateService.placingFeatureType = null;
        return;
      }

      // After raycasting and finding the wall mesh:
      const face = intersects[0].face;
      const sideIndex = face && face.materialIndex !== undefined ? face.materialIndex : 0;
      const sideMap = ['front', 'back', 'side', 'top', 'bottom', 'hole'] as const;
      const side = sideMap[sideIndex] as WallSide;

      // Store in state
      this.editorStateService.selectedWall = mesh;
      this.editorStateService.selectedWallSide = side;

      this.selectWall(mesh);
    } else {
      this.selectWall(null);
    }
  }

  initFeaturePreview() {
    this.canvasRef.nativeElement.addEventListener('pointermove', this.onPointerMovePreview);
  }

  disposeFeaturePreview() {
    this.canvasRef.nativeElement.removeEventListener('pointermove', this.onPointerMovePreview);
    if (this.previewMesh) {
      this.threeRenderService.scene.remove(this.previewMesh);
      this.previewMesh.geometry.dispose();
      (this.previewMesh.material as THREE.Material).dispose();
      this.previewMesh = null;
    }
  }

  onPointerMovePreview = (event: PointerEvent) => {
    if (!this.editorStateService.placingFeatureType) return;

    const canvas = this.canvasRef.nativeElement;
    const mouse = new THREE.Vector2(
      (event.offsetX / canvas.width) * 2 - 1,
      -(event.offsetY / canvas.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.threeRenderService.camera);

    const wallMeshes = this.editorStateService.allWallMeshes.flat();
    const intersects = this.raycaster.intersectObjects(wallMeshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const wall = hit.object as THREE.Mesh;
      const point = hit.point;

      const { startV, endV } = wall.userData;
      let angle = 0;
      if (startV && endV) {
        const wallDir = new THREE.Vector3(endV.x - startV.x, 0, endV.z - startV.z).normalize();
        angle = -Math.atan2(wallDir.z, wallDir.x);
      }

      const wallHeight = this.roomWallService.wallHeight ?? 3;
      const featureHeight = this.editorStateService.placingFeatureType === 'window' ? 1.2 : 2.0;
      let snappedY = Math.max(0, Math.min(wallHeight - featureHeight, Math.round(point.y * 10) / 10));

      if (!this.previewMesh) {
        const size = this.editorStateService.placingFeatureType === 'window'
          ? [1, 1.2, 0.1]
          : [0.9, 2.0, 0.1];
        const geom = new THREE.BoxGeometry(...size);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, opacity: 0.5, transparent: true });
        this.previewMesh = new THREE.Mesh(geom, mat);
        this.threeRenderService.scene.add(this.previewMesh);
      }
      this.previewMesh.position.copy(point);
      this.previewMesh.position.y = snappedY;
      this.previewMesh.rotation.set(0, angle, 0);
      this.previewMesh.visible = true;

      this.lastPreviewWall = wall;
      this.lastPreviewPosition = this.previewMesh.position.clone();
      this.lastPreviewRotationY = angle;
    } else if (this.previewMesh && this.lastPreviewPosition) {
      this.previewMesh.position.copy(this.lastPreviewPosition);
      this.previewMesh.rotation.set(0, this.lastPreviewRotationY, 0);
      this.previewMesh.visible = true;
    }
  };
}