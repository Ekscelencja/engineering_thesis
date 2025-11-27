import * as THREE from 'three';
import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class RoomWallService {
  wallHeight = 2.7;
  wallThickness = 0.2;

  // Shoelace formula for area of polygon (XZ plane)
  calculatePolygonArea(vertices: { x: number, z: number }[]): number {
    let area = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % n];
      area += v1.x * v2.z - v2.x * v1.z;
    }
    console.log('Calculated polygon area:', Math.abs(area) / 2);
    return Math.abs(area) / 2;
  }

  // Generate wall meshes for a room
  generateWallsForRoom(
    scene: THREE.Scene,
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

      scene.add(wallMesh);
      currentRoomWalls.push(wallMesh);
    }
    console.log('Generated walls for room:', currentRoomWalls);
    return currentRoomWalls;
  }
}