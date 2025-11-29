import { Injectable } from '@angular/core';
import * as THREE from 'three';

interface RoomMetadata {
  name: string;
  type: string;
  area: number;
  color: number;
}

@Injectable({ providedIn: 'root' })
export class EditorStateService {
  // Drawing state
  public isDrawing = false;
  public meshDrawingActive = false;
  public drawingVertices: { x: number, z: number }[] = [];
  public drawingVertexMeshes: THREE.Mesh[] = [];
  public drawingLine: THREE.Line | null = null;

  // Editing state
  public editMode = false;
  public vertexHandles: THREE.Mesh[] = [];
  public editingRoomIndex: number | null = null;
  public draggingHandleIndex: number | null = null;

  // Selection state
  public selectedRoomMesh: THREE.Mesh | null = null;
  public get selectedRoomIndex(): number {
    return this.selectedRoomMesh ? this.roomMeshes.indexOf(this.selectedRoomMesh) : -1;
  }

  // Control state
  public ctrlPressed = false;

  // Room/mesh arrays (optional: move here if you want all state in one place)
  public roomMeshes: THREE.Mesh[] = [];
  public allWallMeshes: THREE.Mesh[][] = [];
  public roomMetadata: RoomMetadata[] = [];
  public globalVertices: { x: number, z: number }[] = [];
  public roomVertexIndices: number[][] = [];
}