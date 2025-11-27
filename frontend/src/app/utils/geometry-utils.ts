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

// Check if a point is near the first vertex (for closing polygon)
export function isNearFirstVertex(point: { x: number, z: number }, first: { x: number, z: number }, threshold = 0.5): boolean {
  const dx = point.x - first.x;
  const dz = point.z - first.z;
  console.log('Distance to first vertex:', Math.sqrt(dx * dx + dz * dz));
  return Math.sqrt(dx * dx + dz * dz) < threshold;
}