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
import { FurnitureAsset } from '../api/assets.service';
import { isPointInPolygon, doesAABBIntersectLine } from '../../utils/geometry-utils';

@Injectable({ providedIn: 'root' })
export class EditorEventsService {
  private raycaster = new THREE.Raycaster();
  private canvasRef!: { nativeElement: HTMLCanvasElement };
  private previewMesh: THREE.Mesh | null = null;
  private lastPreviewWall: THREE.Mesh | null = null;
  private lastPreviewPosition: THREE.Vector3 | null = null;
  private lastPreviewRotationY: number = 0;
  public get selectedRoomIndex(): number {
    return this.editorStateService.selectedRoomIndex;
  }

  public furniturePlacementActive = false;
  public placingFurnitureModel: THREE.Object3D | null = null;
  public placingFurnitureAsset: FurnitureAsset | null = null;
  private furnitureRotation: number = 0;
  public placingFurnitureScale: number = 1;

  public viewOnly: boolean = false;
  public feedbackMode: boolean = false;
  public onFeedbackElementSelected?: (
    elementType: 'room' | 'wall' | 'furniture',
    elementId: string,
    position: THREE.Vector3
  ) => void;
  public onFeedbackMarkerClicked?: (feedbackId: string) => void;

  constructor(
    private ngZone: NgZone,
    private editorStateService: EditorStateService,
    private threeRenderService: ThreeRenderService,
    private roomWallService: RoomWallService
  ) { }

  /**
   * Set the canvas reference for event handling.
   * @param canvasRef 
   */
  setCanvasRef(canvasRef: { nativeElement: HTMLCanvasElement }) {
    this.canvasRef = canvasRef;
  }

  /**
   * Set up canvas event listeners based on the current editor state.
   */
  setCanvasListeners() {
    this.deleteCanvasListeners();

    const step = this.editorStateService.editorStep;
    const canvasRef = this.canvasRef.nativeElement;

    switch (step) {
      case 1:
        if (this.editorStateService.editMode) {
          canvasRef.addEventListener('pointerdown', this.onHandlePointerDown);
          canvasRef.addEventListener('pointermove', this.onHandlePointerMove);
          canvasRef.addEventListener('pointerup', this.onHandlePointerUp);
        } else if (this.editorStateService.meshDrawingActive) {
          canvasRef.addEventListener('pointerdown', this.onPointerDown);
        } else {
          canvasRef.addEventListener('pointerdown', this.onRoomSelect);
        }
        break;
      case 2:
        canvasRef.addEventListener('pointerdown', this.onRoomSelect);
        canvasRef.addEventListener('click', this.onCanvasClick);
        break;
      case 3:
        canvasRef.addEventListener('click', this.onCanvasClick);
        canvasRef.addEventListener('mousemove', this.onCanvasMouseMove);
        window.addEventListener('keydown', this.onFurniturePlacementKeyDown);
        break;
    }

    window.addEventListener('pointermove', this.onHandlePointerMove);
    window.addEventListener('pointerup', this.onHandlePointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('keypress', this.onKeyPress);
  }

  /**
   * Remove all canvas event listeners.
   */
  deleteCanvasListeners() {
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onPointerDown);
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onRoomSelect);
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onHandlePointerDown);
    this.canvasRef.nativeElement.removeEventListener('pointermove', this.onHandlePointerMove);
    this.canvasRef.nativeElement.removeEventListener('pointerup', this.onHandlePointerUp);
    this.canvasRef.nativeElement.removeEventListener('click', this.onCanvasClick);
    this.canvasRef.nativeElement.removeEventListener('click', this.selectFurnitureOnClick);
    this.canvasRef.nativeElement.removeEventListener('mousemove', this.onCanvasMouseMove);
    window.removeEventListener('keydown', this.onFurniturePlacementKeyDown);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('keypress', this.onKeyPress);
    window.removeEventListener('pointermove', this.onHandlePointerMove);
    window.removeEventListener('pointerup', this.onHandlePointerUp);
  }

  /**
   * Handle key down events for editor controls.
   * @param event Keydown event
   */
  onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Control') {
      this.editorStateService.ctrlPressed = true;
      if (this.editorStateService.ctrlPressed) this.threeRenderService.controls.enabled = true;
    }
    if (event.key === 'Delete') {
      if (
        this.editorStateService.editorStep === 3 &&
        this.editorStateService.selectedFurnitureIndex !== null
      ) {
        this.roomWallService.deleteSelectedFurniture();
      } else {
        this.roomWallService.deleteSelectedRoom();
      }
    }
  };

  /**
   * Handle key up events for editor controls.
   * @param event Keyup event
   */
  onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Control') {
      this.editorStateService.ctrlPressed = false;
      if (!this.editorStateService.ctrlPressed) this.threeRenderService.controls.enabled = false;
    }
  };

  /**
   * Handle key press events for toggling modes.
   * @param event Keypress event
   */
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

  /**
   * Handle pointer down events for drawing mode.
   * @param event PointerEvent triggered on pointer down.
   */
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

  /**
   * Handle pointer down events for vertex handle dragging.
   * @param event PointerEvent triggered on pointer down.
   */
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

  /**
   * Handle pointer move events for vertex handle dragging.
   * @param event PointerEvent triggered on pointer move.
   */
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

  /**
   * Handle pointer up events to stop vertex handle dragging.
   * @param event PointerEvent triggered on pointer up.
   */
  onHandlePointerUp = (_event: PointerEvent) => {
    if (!this.editorStateService.editMode) return;
    this.editorStateService.draggingHandleIndex = null;
  };

  /**   
   * Handle room selection on pointer down.
   * @param event PointerEvent triggered on pointer down.
   */
  onRoomSelect = (event: PointerEvent) => {
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

  /**   
   * Select and highlight the given wall mesh.
   * @param wall The wall mesh to select.
   */
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

  /**
   * Handle canvas click events for wall selection and feature placement.
   * @param event MouseEvent triggered on canvas click.
   */ 
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

      const face = intersects[0].face;
      const sideIndex = face && face.materialIndex !== undefined ? face.materialIndex : 0;
      const sideMap = ['front', 'back', 'side', 'top', 'bottom', 'hole'] as const;
      const side = sideMap[sideIndex] as WallSide;

      this.editorStateService.selectedWall = mesh;
      this.editorStateService.selectedWallSide = side;

      this.selectWall(mesh);
    } else {
      this.selectWall(null);
    }
  }

  /**
   * Initialize feature placement preview.
   */
  initFeaturePreview() {
    this.canvasRef.nativeElement.addEventListener('pointermove', this.onPointerMovePreview);
  }

  /**
   * Dispose of the feature placement preview.
   */
  disposeFeaturePreview() {
    this.canvasRef.nativeElement.removeEventListener('pointermove', this.onPointerMovePreview);
    if (this.previewMesh) {
      this.threeRenderService.scene.remove(this.previewMesh);
      this.previewMesh.geometry.dispose();
      (this.previewMesh.material as THREE.Material).dispose();
      this.previewMesh = null;
    }
  }

  /**
   * Handle pointer move events for feature placement preview.
   * @param event PointerEvent triggered on pointer move.
   */
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

  /**
   * Enable furniture placement mode.
   * @param placingFurnitureModel 
   * @param placingFurnitureAsset 
   */
  enableFurniturePlacement(
    placingFurnitureModel: THREE.Object3D,
    placingFurnitureAsset: FurnitureAsset
  ) {
    this.furniturePlacementActive = true;
    this.placingFurnitureModel = placingFurnitureModel;
    this.placingFurnitureAsset = placingFurnitureAsset;
    this.furnitureRotation = 0;
    this.placingFurnitureScale = 1;
    window.addEventListener('wheel', this.onFurniturePlacementWheel, { passive: false });
  }

  /**
   * Disable furniture placement mode.
   */
  disableFurniturePlacement() {
    this.furniturePlacementActive = false;
    this.placingFurnitureModel = null;
    this.placingFurnitureAsset = null;
    window.removeEventListener('wheel', this.onFurniturePlacementWheel);
  }

  /**
   * Handle key down events for furniture placement controls.
   * @param event WheelEvent for scaling furniture during placement.
   */
  onFurniturePlacementWheel = (event: WheelEvent) => {
    if (!this.furniturePlacementActive || !this.placingFurnitureModel) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1.05 : 0.95;
    this.placingFurnitureScale = Math.max(0.1, Math.min(5, this.placingFurnitureScale * delta));
    this.placingFurnitureModel.scale.setScalar(this.placingFurnitureScale);
  };

  /**
   * Handle mouse move events for furniture placement preview.
   * @param event MouseEvent triggered on mouse move.
   */
  onCanvasMouseMove = (event: MouseEvent) => {
    if (this.furniturePlacementActive && this.placingFurnitureModel) {
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
        const point = { x: intersection.x, z: intersection.z };
        let insideAnyRoom = false;
        for (const indices of this.editorStateService.roomVertexIndices) {
          const verts = indices.map(idx => this.editorStateService.globalVertices[idx]);
          if (isPointInPolygon(point, verts)) {
            insideAnyRoom = true;
            break;
          }
        }
        if (insideAnyRoom) {
          const box = new THREE.Box3().setFromObject(this.placingFurnitureModel);
          const size = new THREE.Vector3();
          box.getSize(size);
          const min = { x: intersection.x + box.min.x, z: intersection.z + box.min.z };
          const max = { x: intersection.x + box.max.x, z: intersection.z + box.max.z };
          let collision = false;
          for (const indices of this.editorStateService.roomVertexIndices) {
            for (let i = 0; i < indices.length; i++) {
              const a = this.editorStateService.globalVertices[indices[i]];
              const b = this.editorStateService.globalVertices[indices[(i + 1) % indices.length]];
              if (doesAABBIntersectLine({ min, max }, a, b)) {
                collision = true;
                break;
              }
            }
            if (collision) break;
          }
          if (!collision) {
            const SNAP_DISTANCE = 0.3;

            let snapWall: { a: { x: number, z: number }, b: { x: number, z: number }, dist: number, closest: { x: number, z: number } } | null = null;

            for (const indices of this.editorStateService.roomVertexIndices) {
              for (let i = 0; i < indices.length; i++) {
                const a = this.editorStateService.globalVertices[indices[i]];
                const b = this.editorStateService.globalVertices[indices[(i + 1) % indices.length]];
                const wallVec = { x: b.x - a.x, z: b.z - a.z };
                const wallLenSq = wallVec.x * wallVec.x + wallVec.z * wallVec.z;
                let t = ((point.x - a.x) * wallVec.x + (point.z - a.z) * wallVec.z) / (wallLenSq || 1e-10);
                t = Math.max(0, Math.min(1, t));
                const closest = { x: a.x + t * wallVec.x, z: a.z + t * wallVec.z };
                const dist = Math.hypot(point.x - closest.x, point.z - closest.z);
                if (dist < SNAP_DISTANCE && (!snapWall || dist < snapWall.dist)) {
                  snapWall = { a, b, dist, closest };
                }
              }
            }

            if (snapWall) {
              this.placingFurnitureModel.position.x = snapWall.closest.x;
              this.placingFurnitureModel.position.z = snapWall.closest.z;

              const dx = snapWall.b.x - snapWall.a.x;
              const dz = snapWall.b.z - snapWall.a.z;
              const wallAngle = Math.atan2(dz, dx);
              this.placingFurnitureModel.rotation.y = wallAngle + Math.PI / 2;
            } else {
              this.placingFurnitureModel.position.x = intersection.x;
              this.placingFurnitureModel.position.z = intersection.z;
            }
          }
        }
      }
    }
  };

  /**
   * Handle canvas click events for feedback selection and furniture placement.
   * @param event MouseEvent triggered on canvas click.
   */
  onCanvasClick = (event: MouseEvent) => {
    const feedbackMarker = this.checkFeedbackMarkerClick(event);
    if (feedbackMarker) {
      const feedbackId = feedbackMarker.userData['feedbackId'];
      if (this.onFeedbackMarkerClicked && feedbackId) {
        this.onFeedbackMarkerClicked(feedbackId);
      }
      return;
    }

    if (this.feedbackMode) {
      this.handleFeedbackSelection(event);
      return;
    }

    if (this.viewOnly) {
      return;
    }

    if (this.furniturePlacementActive && this.placingFurnitureModel && this.placingFurnitureAsset && this.editorStateService.editorStep === 3) {
      this.editorStateService.placedFurnitures.push({
        asset: this.placingFurnitureAsset,
        position: this.placingFurnitureModel.position.clone(),
        rotation: this.placingFurnitureModel.rotation.y,
        mesh: this.placingFurnitureModel,
        scale: this.placingFurnitureScale
      });
      this.disableFurniturePlacement();
      return;
    }

    if (this.editorStateService.editorStep === 3) {
      this.selectFurnitureOnClick(event);
    } else if (this.editorStateService.editorStep === 2) {
      this.handleWallClick(event);
    }
  };

  /**
   * Handle key down events for furniture placement adjustments.
   * @param event KeyboardEvent triggered on key down.
   */
  onFurniturePlacementKeyDown = (event: KeyboardEvent) => {
    if (!this.furniturePlacementActive || !this.placingFurnitureModel) return;
    let changed = false;
    if (event.key === 'ArrowLeft') {
      this.furnitureRotation += Math.PI / 24;
      changed = true;
    } else if (event.key === 'ArrowRight') {
      this.furnitureRotation -= Math.PI / 24;
      changed = true;
    }

    const wallHeight = this.roomWallService.wallHeight ?? 3;
    const step = 0.1;

    if (event.key === 'ArrowUp') {
      let newY = this.placingFurnitureModel.position.y + step;
      newY = Math.min(newY, wallHeight);
      this.placingFurnitureModel.position.y = newY;
      changed = true;
    } else if (event.key === 'ArrowDown') {
      let newY = this.placingFurnitureModel.position.y - step;
      newY = Math.max(newY, 0);
      this.placingFurnitureModel.position.y = newY;
      changed = true;
    }
    if (changed) {
      this.placingFurnitureModel.rotation.y = this.furnitureRotation;
      event.preventDefault();
    }
  };

  /**
   * Select furniture on canvas click.
   * @param event MouseEvent triggered on canvas click.
   */
  selectFurnitureOnClick = (event: MouseEvent) => {
    if (this.furniturePlacementActive) return;

    const canvas = this.canvasRef.nativeElement;
    const mouse = new THREE.Vector2(
      (event.offsetX / canvas.width) * 2 - 1,
      -(event.offsetY / canvas.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.threeRenderService.camera);

    const meshes: THREE.Mesh[] = [];
    for (const f of this.editorStateService.placedFurnitures) {
      f.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) meshes.push(child);
      });
    }
    const intersects = this.raycaster.intersectObjects(meshes, false);

    const prevIdx = this.editorStateService.selectedFurnitureIndex;
    if (prevIdx !== null && prevIdx >= 0) {
      const prevPf = this.editorStateService.placedFurnitures[prevIdx];
      prevPf.mesh.traverse(child => {
        if (child instanceof THREE.Mesh && child.userData['highlightMaterial']) {
          child.material = child.userData['originalMaterial'];
          child.userData['highlightMaterial'].dispose();
          child.userData['highlightMaterial'] = undefined;
        }
      });
    }

    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      const pfIndex = this.editorStateService.placedFurnitures.findIndex(f => {
        let found = false;
        f.mesh.traverse(child => {
          if (child === mesh) found = true;
        });
        return found;
      });
      this.editorStateService.selectedFurnitureIndex = pfIndex;

      if (pfIndex !== -1) {
        const pf = this.editorStateService.placedFurnitures[pfIndex];
        pf.mesh.traverse(child => {
          if (child instanceof THREE.Mesh) {
            if (!child.userData['originalMaterial']) {
              child.userData['originalMaterial'] = child.material;
            }
            const highlightMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
            child.userData['highlightMaterial'] = highlightMat;
            child.material = highlightMat;
          }
        });
      }
    } else {
      this.editorStateService.selectedFurnitureIndex = null;
    }
  };

  /**
   * Check if a feedback marker was clicked.
   * @param event MouseEvent triggered on canvas click.
   */
  private checkFeedbackMarkerClick(event: MouseEvent): THREE.Mesh | null {
    if (!this.canvasRef) return null;

    const canvas = this.canvasRef.nativeElement;
    const mouse = new THREE.Vector2(
      (event.offsetX / canvas.width) * 2 - 1,
      -(event.offsetY / canvas.height) * 2 + 1
    );

    this.raycaster.setFromCamera(mouse, this.threeRenderService.camera);

    const feedbackMarkers = this.editorStateService.feedbackMarkers;
    if (!feedbackMarkers || feedbackMarkers.length === 0) return null;

    const intersects = this.raycaster.intersectObjects(feedbackMarkers, false);

    if (intersects.length > 0) {
      return intersects[0].object as THREE.Mesh;
    }
    return null;
  }

  /**
   * Handle feedback element selection on canvas click.
   * @param event MouseEvent triggered on canvas click.
   */
  private handleFeedbackSelection(event: MouseEvent): void {
    if (!this.canvasRef || !this.onFeedbackElementSelected) return;

    const canvas = this.canvasRef.nativeElement;
    const mouse = new THREE.Vector2(
      (event.offsetX / canvas.width) * 2 - 1,
      -(event.offsetY / canvas.height) * 2 + 1
    );

    this.raycaster.setFromCamera(mouse, this.threeRenderService.camera);

    const furnitureMeshes: THREE.Mesh[] = [];
    for (const f of this.editorStateService.placedFurnitures) {
      f.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) furnitureMeshes.push(child);
      });
    }

    let intersects = this.raycaster.intersectObjects(furnitureMeshes, false);
    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const point = intersects[0].point;

      const furnitureIndex = this.editorStateService.placedFurnitures.findIndex(f => {
        let found = false;
        f.mesh.traverse(child => {
          if (child === hitMesh) found = true;
        });
        return found;
      });

      if (furnitureIndex >= 0) {
        this.onFeedbackElementSelected(
          'furniture',
          furnitureIndex.toString(),
          point.clone()
        );
        return;
      }
    }

    const wallMeshes = this.editorStateService.allWallMeshes.flat();
    intersects = this.raycaster.intersectObjects(wallMeshes, false);
    if (intersects.length > 0) {
      const wall = intersects[0].object as THREE.Mesh;
      const point = intersects[0].point;
      this.onFeedbackElementSelected(
        'wall',
        wall.uuid,
        point.clone()
      );
      return;
    }

    const roomMeshes = this.editorStateService.roomMeshes;
    intersects = this.raycaster.intersectObjects(roomMeshes, false);
    if (intersects.length > 0) {
      const room = intersects[0].object as THREE.Mesh;
      const point = intersects[0].point;
      const roomIndex = roomMeshes.indexOf(room);
      this.onFeedbackElementSelected(
        'room',
        roomIndex.toString(),
        point.clone()
      );
      return;
    }
  }
}