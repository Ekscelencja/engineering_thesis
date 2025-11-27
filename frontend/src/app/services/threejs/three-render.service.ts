import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';
import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class ThreeRenderService {
    public renderer!: THREE.WebGLRenderer;
    public scene!: THREE.Scene;
    public camera!: THREE.PerspectiveCamera;
    public controls!: OrbitControls;
    private animationId: number | null = null;

    init(canvas: HTMLCanvasElement) {
        const width = canvas.clientWidth || 800;
        const height = canvas.clientHeight || 600;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(0, 35, 0);
        this.camera.lookAt(0, 0, 0);
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setClearColor(0xdedede);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 50;
        this.controls.maxPolarAngle = Math.PI / 2;

        // Grid, axes, compass, lighting
        this.addGrid();
        this.addAxes();
        //this.addCompass();
        // this.addAxisLabel('X', 5, 0, 0, 0xff0000);
        // this.addAxisLabel('Y', 0, 5, 0, 0x00ff00);
        // this.addAxisLabel('Z', 0, 0, 5, 0x0000ff);
        this.addLighting();
    }

    animate() {
        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    stopAnimation() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.animationId = null;
    }

    resize(canvas: HTMLCanvasElement) {
        const width = canvas.clientWidth || window.innerWidth;
        const height = canvas.clientHeight || window.innerHeight;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    // --- Helpers for grid, axes, compass, lighting ---
    private addGrid() {
        const grid = new THREE.GridHelper(40, 40, 0x888888, 0xbbbbbb);
        (grid.material as THREE.Material).opacity = 0.8;
        (grid.material as THREE.Material).transparent = true;
        this.scene.add(grid);
    }

    private addAxes() {
        const axesHelper = new THREE.AxesHelper(5);
        this.scene.add(axesHelper);
        // Add axis labels if needed (can be moved here from component)
    }

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

    private addLighting() {
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(5, 10, 7.5);
        this.scene.add(light);
    }
}