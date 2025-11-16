import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, signal, NgZone } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';

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
  private drawingVertices: { x: number, z: number }[] = [];
  private isDrawing: boolean = false;
  private drawingLine: THREE.Line | null = null;
  private polygonMesh: THREE.Mesh | null = null;
  private roomMeshes: THREE.Mesh[] = [];
  private controls!: OrbitControls;
  private ctrlPressed: boolean = false;
  private meshDrawingActive: boolean = false;
  private allWallMeshes: THREE.Mesh[][] = [];
  private wallHeight: number = 2.7
  private wallThickness: number = 0.2;
  constructor(private ngZone: NgZone) { }

  ngAfterViewInit() {
    this.initThree();
    this.animate();
    // Attach mouse event listener for drawing
    this.ngZone.runOutsideAngular(() => {
      this.canvasRef.nativeElement.addEventListener('pointerdown', this.onPointerDown);
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('keypress', this.onKeyPress);
    });
  }

  ngOnDestroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.renderer) this.renderer.dispose();
    this.canvasRef.nativeElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('keypress', this.onKeyPress);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Control') {
      this.ctrlPressed = true;
      if (this.ctrlPressed) this.controls.enabled = true;
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Control') {
      this.ctrlPressed = false;
      if (!this.ctrlPressed) this.controls.enabled = false;
    }
  };

  private onKeyPress = (event: KeyboardEvent) => {
    if (event.key === 'd' || event.key === 'D') this.meshDrawingActive = !this.meshDrawingActive; 
  };

  private initThree() {
    const width = this.canvasRef.nativeElement.clientWidth || 800;
    const height = this.canvasRef.nativeElement.clientHeight || 600;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.set(0, 15, 0);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvasRef.nativeElement, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0xdedede);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 50;
    this.controls.maxPolarAngle = Math.PI / 2; // Limit to horizontal view

    // Grid: 1 unit = 1 meter, 20x20 meters
    const grid = new THREE.GridHelper(20, 20, 0x888888, 0xbbbbbb);
    (grid.material as THREE.Material).opacity = 0.8;
    (grid.material as THREE.Material).transparent = true;
    this.scene.add(grid);
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

  private getWorldXZFromPointer(event: PointerEvent): { x: number, z: number } | null {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // XZ plane at Y=0
    const intersection = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, intersection)) {
      // Optional: snap to grid (1 meter)
      return {
        x: Math.round(intersection.x),
        z: Math.round(intersection.z)
      };
    }
    return null;
  }

  // Handles pointer down events for drawing
  private onPointerDown = (event: PointerEvent) => {
    if (this.ctrlPressed || !this.meshDrawingActive) return;
    
    if (!this.isDrawing) {
      this.isDrawing = true;
      this.drawingVertices = [];

      if(this.drawingLine) {
        this.scene.remove(this.drawingLine);
        this.drawingLine.geometry.dispose();
        (this.drawingLine.material as THREE.Material).dispose();
        this.drawingLine = null;
      }
    }
    const point = this.getWorldXZFromPointer(event);
    if (point) {
      if (this.drawingVertices.length >= 3 && this.isNearFirstVertex(point)) {
        this.closePolygon();
        return;
      }
      this.drawingVertices.push(point);
      console.log('drawingVertices:', this.drawingVertices);
      this.updateDrawingLine();
    }
  };

  private updateDrawingLine() {
    if (this.drawingLine) {
      this.scene.remove(this.drawingLine);
      this.drawingLine.geometry.dispose();
      (this.drawingLine.material as THREE.Material).dispose();
      this.drawingLine = null;
    }
    if (this.drawingVertices.length < 2) return;

    const points = this.drawingVertices.map(v => new THREE.Vector3(v.x, 0.01, v.z));
    const geomerty = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
    this.drawingLine = new THREE.Line(geomerty, material);
    this.scene.add(this.drawingLine);
  }

  private closePolygon() {
    this.isDrawing = false;
    if(this.drawingLine) {
      this.scene.remove(this.drawingLine);
      this.drawingLine.geometry.dispose();
      (this.drawingLine.material as THREE.Material).dispose();
      this.drawingLine = null;
    }
    
    const shape = new THREE.Shape(
      this.drawingVertices.map(v => new THREE.Vector2(v.x, -v.z)
    ));

    const geometry = new THREE.ShapeGeometry(shape);
    const roomColor = Math.floor(Math.random() * 0xffffff);
    const material = new THREE.MeshStandardMaterial({
      color: roomColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;
    this.scene.add(mesh);
    this.roomMeshes.push(mesh);

    this.generateWallsForRoom(this.drawingVertices, roomColor);
  }

  private isNearFirstVertex(point: { x: number, z: number }, threshold: number = 0.3): boolean {
    if (this.drawingVertices.length === 0) return false;
    const first = this.drawingVertices[0];
    const dx = point.x - first.x;
    const dz = point.z - first.z;
    return Math.sqrt(dx * dx + dz * dz) <= threshold;
  }

  private generateWallsForRoom(vertices: { x: number, z: number }[], roomColor: number) {
    const currentRoomWalls: THREE.Mesh[] = [];
  
    for (let i = 0; i < vertices.length; i++) {
      const startV = vertices[i];
      const endV = vertices[(i + 1) % vertices.length];

      //calculate wall parameters like lenght and angle
      const dx = endV.x - startV.x;
      const dz = endV.z - startV.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx); 

      //create wall geometry and mesh
      const wallGeometry = new THREE.BoxGeometry(length, this.wallHeight, this.wallThickness);
      const wallMaterial = new THREE.MeshStandardMaterial({ color: roomColor });
      const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);

      //postioning of the wall: centered between start and end vertex, raised by half wall height
      wallMesh.position.set(
        (startV.x + endV.x) / 2,
        this.wallHeight / 2,
        (startV.z + endV.z) / 2
      );
      wallMesh.rotation.y = -angle; //rotate to align with start-end direction
      this.scene.add(wallMesh);
      currentRoomWalls.push(wallMesh);
    }
    this.allWallMeshes.push(currentRoomWalls);
  }

  private animate = () => {
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
    this.animationId = requestAnimationFrame(this.animate);
  };
}
