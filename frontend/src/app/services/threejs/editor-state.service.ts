import { Injectable } from '@angular/core';
import { WallFeature, WallSide } from '../../models/room-feature.model';
import * as THREE from 'three';

export interface RoomMetadata {
  name: string;
  type: string;
  area: number;
  color: number;
  wallFeatures?: WallFeature[][]; // Array of features per wall
}

@Injectable({ providedIn: 'root' })
export class EditorStateService {
  // Step-based workflow: 1=Rooms, 2=Walls/Features, 3=Furnishing
  public editorStep: 1 | 2 | 3 = 1;

  // Drawing state aa
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
  public selectedWall: THREE.Mesh | null = null;
  public selectedWallSide: WallSide | null = null;
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
  public placingFeatureType: 'window' | 'door' | null = null;
  public wallAppearance: Record<string, {
    front?: { color?: string; texture?: string },
    back?: { color?: string; texture?: string },
    side?: { color?: string; texture?: string },
    top?: { color?: string; texture?: string },
    bottom?: { color?: string; texture?: string },
    hole?: { color?: string; texture?: string }
  }> = {};
  public floorAppearance: Record<string, { color?: string; texture?: string }> = {};
}