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

    /**
     * Initialize the Three.js renderer, scene, and camera.
     * @param canvas 
     */
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

        this.addGrid();
        this.addAxes();
        this.addAxisLabel('X', 5, 0, 0, 0xff0000);
        this.addAxisLabel('Y', 0, 5, 0, 0x00ff00);
        this.addAxisLabel('Z', 0, 0, 5, 0x0000ff);
        this.addLighting();
    }

    /**
     * Start the animation loop.
     */
    animate() {
        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    /**     
     * Stop the animation loop.
     */
    stopAnimation() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.animationId = null;
    }

    /**
     * Handle resizing of the renderer and camera aspect ratio.
     * @param canvas The HTML canvas element to resize to.
     */
    resize(canvas: HTMLCanvasElement) {
        const width = canvas.clientWidth || window.innerWidth;
        const height = canvas.clientHeight || window.innerHeight;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    /** 
     * Add a grid helper to the scene 
     */
    private addGrid() {
        const grid = new THREE.GridHelper(40, 40, 0x888888, 0xbbbbbb);
        (grid.material as THREE.Material).opacity = 0.8;
        (grid.material as THREE.Material).transparent = true;
        this.scene.add(grid);
    }

    /** 
     * Add axes helper to the scene 
     */
    private addAxes() {
        const axesHelper = new THREE.AxesHelper(5);
        this.scene.add(axesHelper);
    }

    /** 
     * Add axis label to the scene 
     */
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

    /** 
     * Add basic lighting to the scene 
     */
    private addLighting() {
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(5, 10, 7.5);
        this.scene.add(light);

        const topLight = new THREE.DirectionalLight(0xffffff, 0.5);
        topLight.position.set(0, 20, 0);
        this.scene.add(topLight);

        const northLight = new THREE.DirectionalLight(0xffffff, 0.3);
        northLight.position.set(0, 0, 20);
        this.scene.add(northLight);

        const southLight = new THREE.DirectionalLight(0xffffff, 0.3);
        southLight.position.set(0, 0, -20);
        this.scene.add(southLight);

        const eastLight = new THREE.DirectionalLight(0xffffff, 0.3);
        eastLight.position.set(20, 0, 0);
        this.scene.add(eastLight);

        const westLight = new THREE.DirectionalLight(0xffffff, 0.3);
        westLight.position.set(-20, 0, 0);
        this.scene.add(westLight);
    }
}