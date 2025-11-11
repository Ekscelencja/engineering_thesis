import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, signal, NgZone } from '@angular/core';
import * as THREE from 'three';

@Component({
  selector: 'app-three-canvas',
  standalone: true,
  templateUrl: './three-canvas.html',
  styleUrls: ['./three-canvas.scss']
})
export class ThreeCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private animationId: number | null = null;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private drawingVertices: THREE.Vector3[] = [];
  private drawingLine?: THREE.Line;
  private drawingPolygon?: THREE.Mesh;
  private isDrawing = true;

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit() {
    this.initThree();
    this.animate();
    // Attach mouse event listener for drawing
    this.ngZone.runOutsideAngular(() => {
      this.canvasRef.nativeElement.addEventListener('pointerdown', this.onPointerDown);
    });
  }

  ngOnDestroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.renderer) this.renderer.dispose();
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onPointerDown);
  }
  // Handle pointer down event for drawing room polygon
  private onPointerDown = (event: PointerEvent) => {
    if (!this.isDrawing) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.mouse.set(x, y);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    // Intersect with XZ plane (Y=0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, intersection);
    // Snap to nearest integer (meter grid)
    intersection.x = Math.round(intersection.x);
    intersection.z = Math.round(intersection.z);
    intersection.y = 0;
    // If first point, start new polygon
    if (this.drawingVertices.length > 0 && intersection.distanceTo(this.drawingVertices[0]) < 0.5 && this.drawingVertices.length > 2) {
      // Close polygon
      this.finishPolygon();
      this.isDrawing = false;
      return;
    }
    this.drawingVertices.push(intersection.clone());
    this.updateDrawingLine();
  };

  // Reset drawing state (for future use)
  public resetDrawing() {
    this.isDrawing = true;
    this.drawingVertices = [];
    if (this.drawingLine) {
      this.scene.remove(this.drawingLine);
      this.drawingLine = undefined;
    }
    if (this.drawingPolygon) {
      this.scene.remove(this.drawingPolygon);
      this.drawingPolygon = undefined;
    }
  }

  // Draw lines between clicked points
  private updateDrawingLine() {
    if (this.drawingLine) {
      this.scene.remove(this.drawingLine);
    }
    if (this.drawingVertices.length < 2) return;
    const points = [...this.drawingVertices, this.drawingVertices[0]];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x00bfae, linewidth: 2 });
    this.drawingLine = new THREE.Line(geometry, material);
    this.scene.add(this.drawingLine);
  }

  // Fill the polygon when closed
  private finishPolygon() {
    if (this.drawingPolygon) {
      this.scene.remove(this.drawingPolygon);
    }
    const shape = new THREE.Shape(this.drawingVertices.map(v => new THREE.Vector2(v.x, v.z)));
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({ color: 0x90caf9, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    this.drawingPolygon = new THREE.Mesh(geometry, material);
    this.scene.add(this.drawingPolygon);
    // Remove the drawing line
    if (this.drawingLine) {
      this.scene.remove(this.drawingLine);
      this.drawingLine = undefined;
    }
    this.drawingVertices = [];
  }

  private initThree() {
    const width = this.canvasRef.nativeElement.clientWidth || 800;
    const height = this.canvasRef.nativeElement.clientHeight || 600;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.set(0, 5, 0);
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvasRef.nativeElement, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0xdedede);

    // Grid: 1 unit = 1 meter, 20x20 meters
    const grid = new THREE.GridHelper(20, 20, 0x888888, 0xbbbbbb);
    (grid.material as THREE.Material).opacity = 0.8;
    (grid.material as THREE.Material).transparent = true;
    //this.scene.add(grid);
    const axesHelper = new THREE.AxesHelper(5);
    this.scene.add(axesHelper);
    // Axis labels (X, Z)
    this.addAxisLabel('X', 10.5, 0.01, 0, 0xff3333);
    this.addAxisLabel('Z', 0, 0.01, 10.5, 0x3333ff);

    // Tick marks every 5 meters
    for (let i = -10; i <= 10; i += 5) {
      if (i !== 0) {
        this.addAxisLabel(i.toString(), i, 0.01, 0, 0xff3333, 0.5);
        this.addAxisLabel(i.toString(), 0, 0.01, i, 0x3333ff, 0.5);
      }
    }

    // Compass (N/E/S/W) - simple arrows
    this.addCompass();

    // Remove test cube for now
    // const geometry = new THREE.BoxGeometry();
    // const material = new THREE.MeshStandardMaterial({ color: 0x0077ff });
    // const cube = new THREE.Mesh(geometry, material);
    // cube.position.set(0, 0.5, 0);
    // this.scene.add(cube);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 7.5);
    this.scene.add(light);

  }

  // Add 3D axis label (simple plane with text texture)
  private addAxisLabel(text: string, x: number, y: number, z: number, color: number, scale = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.set(1.5 * scale, 0.75 * scale, 1);
    this.scene.add(sprite);
  }

  // Add a simple compass rose in the corner (N/E/S/W)
  private addCompass() {
    // Compass is a group of arrows and labels in the +X/+Z quadrant
    const compassGroup = new THREE.Group();
    const arrowLen = 1.5;
    const arrowColor = 0x222222;
    // North (Z+)
    compassGroup.add(this.createCompassArrow(0, 0.01, 0, 0, 0, arrowLen, arrowColor, 'N'));
    // East (X+)
    compassGroup.add(this.createCompassArrow(0, 0.01, 0, arrowLen, 0, 0, arrowColor, 'E'));
    // South (Z-)
    compassGroup.add(this.createCompassArrow(0, 0.01, 0, 0, 0, -arrowLen, arrowColor, 'S'));
    // West (X-)
    compassGroup.add(this.createCompassArrow(0, 0.01, 0, -arrowLen, 0, 0, arrowColor, 'W'));
    compassGroup.position.set(-8, 0, -8);
    this.scene.add(compassGroup);
  }

  // Helper to create a compass arrow with label
  private createCompassArrow(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color: number, label: string) {
    const dir = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1).normalize();
    const origin = new THREE.Vector3(x1, y1, z1);
    const length = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1).length();
    const arrowHelper = new THREE.ArrowHelper(dir, origin, length, color, 0.3, 0.15);
    // Add label at the end
    const labelSprite = this.createCompassLabel(label, x2, y2, z2, color);
    const group = new THREE.Group();
    group.add(arrowHelper);
    group.add(labelSprite);
    return group;
  }

  private createCompassLabel(text: string, x: number, y: number, z: number, color: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y + 0.1, z);
    sprite.scale.set(0.7, 0.35, 1);
    return sprite;
  }

  private animate = () => {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
    this.animationId = requestAnimationFrame(this.animate);
  };
}
