import * as THREE from 'three';

// Shoelace formula for area of polygon (XZ plane)
export function calculatePolygonArea(vertices: { x: number, z: number }[]): number {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % n];
    area += v1.x * v2.z - v2.x * v1.z;
  }
  return Math.abs(area) / 2;
}

export function isNearFirstVertex(point: { x: number, z: number }, first: { x: number, z: number }, threshold = 0.5): boolean {
  const dx = point.x - first.x;
  const dz = point.z - first.z;
  return Math.sqrt(dx * dx + dz * dz) < threshold;
}

export function getWorldXZFromPointer(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster
): { x: number, z: number } | null {
  const rect = canvas.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(mouse, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // XZ plane at Y=0
  const intersection = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, intersection)) {
    // Optional: snap to grid (1 meter)
    return {
      x: Math.round(intersection.x),
      z: Math.round(intersection.z)
    };
  }
  return null;
}

export function updateDrawingLine(
  drawingVertices: { x: number, z: number }[],
  scene: THREE.Scene,
  drawingLine: THREE.Line | null
): THREE.Line | null {
  if (drawingLine) {
    scene.remove(drawingLine);
    drawingLine.geometry.dispose();
    (drawingLine.material as THREE.Material).dispose();
    drawingLine = null;
  }
  if (drawingVertices.length < 2) return null;

  const points = drawingVertices.map((v) => new THREE.Vector3(v.x, 0.01, v.z));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  return line;
}

export function highlightDrawingVertex(
  position: { x: number, z: number },
  scene: THREE.Scene,
  drawingVertexMeshes: THREE.Mesh[]
) {
  const geometry = new THREE.SphereGeometry(0.2, 16, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0xff8800 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position.x, 0.1, position.z);
  scene.add(mesh);
  drawingVertexMeshes.push(mesh);
}

export function clearDrawingVertexHighlights(
  scene: THREE.Scene,
  drawingVertexMeshes: THREE.Mesh[]
) {
  for (const mesh of drawingVertexMeshes) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  drawingVertexMeshes.length = 0;
}

export function findOrAddGlobalVertex(
  v: { x: number, z: number },
  globalVertices: { x: number, z: number }[],
  threshold: number = 0.01
): number {
  for (let i = 0; i < globalVertices.length; i++) {
    const gv = globalVertices[i];
    if (Math.abs(gv.x - v.x) < threshold && Math.abs(gv.z - v.z) < threshold) {
      return i;
    }
  }
  globalVertices.push({ x: v.x, z: v.z });
  return globalVertices.length - 1;
}

export function canonicalWallKey(a: {x: number, z: number}, b: {x: number, z: number}) {
  if (a.x < b.x || (a.x === b.x && a.z < b.z)) {
    return `${a.x},${a.z}|${b.x},${b.z}`;
  } else {
    return `${b.x},${b.z}|${a.x},${a.z}`;
  }
}

export function isPointInPolygon(point: {x: number, z: number}, polygon: {x: number, z: number}[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    const intersect = ((zi > point.z) !== (zj > point.z)) &&
      (point.x < (xj - xi) * (point.z - zi) / ((zj - zi) || 1e-10) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function doesAABBIntersectLine(aabb: {min: {x: number, z: number}, max: {x: number, z: number}}, p1: {x: number, z: number}, p2: {x: number, z: number}): boolean {
  const inside = (p: {x: number, z: number}) =>
    p.x >= aabb.min.x && p.x <= aabb.max.x && p.z >= aabb.min.z && p.z <= aabb.max.z;
  if (inside(p1) || inside(p2)) return true;

  const boxEdges = [
    [{x: aabb.min.x, z: aabb.min.z}, {x: aabb.max.x, z: aabb.min.z}],
    [{x: aabb.max.x, z: aabb.min.z}, {x: aabb.max.x, z: aabb.max.z}],
    [{x: aabb.max.x, z: aabb.max.z}, {x: aabb.min.x, z: aabb.max.z}],
    [{x: aabb.min.x, z: aabb.max.z}, {x: aabb.min.x, z: aabb.min.z}]
  ];
  for (const [q1, q2] of boxEdges) {
    if (segmentsIntersect2D(p1, p2, q1, q2)) return true;
  }
  return false;
}

export function segmentsIntersect2D(p1: {x: number, z: number}, p2: {x: number, z: number}, q1: {x: number, z: number}, q2: {x: number, z: number}): boolean {
  function ccw(a: any, b: any, c: any) {
    return (c.z - a.z) * (b.x - a.x) > (b.z - a.z) * (c.x - a.x);
  }
  return (ccw(p1, q1, q2) !== ccw(p2, q1, q2)) && (ccw(p1, p2, q1) !== ccw(p1, p2, q2));
}