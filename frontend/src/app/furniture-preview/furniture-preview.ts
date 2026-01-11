import { Component, Input, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

@Component({
    selector: 'app-furniture-preview',
    templateUrl: './furniture-preview.html',
    styleUrls: ['./furniture-preview.scss']
})
export class FurniturePreviewComponent implements AfterViewInit, OnDestroy {
    @Input() asset!: { name: string; folder: string; obj: string; mtl?: string; scale: number };
    @ViewChild('fpreview', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

    private renderer!: THREE.WebGLRenderer;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private model?: THREE.Object3D;
    private animationId?: number;

    ngAfterViewInit() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, 1.2, 0.1, 100);
        this.camera.position.set(0, 1, 2);
        this.camera.lookAt(0, 0.5, 0);

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvasRef.nativeElement, alpha: true, antialias: true });
        this.renderer.setClearColor(0x000000, 0); // transparent background
        this.renderer.setSize(120, 100);

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 5, 2);
        this.scene.add(light);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        // Load model
        const basePath = `assets/3d_objects/${this.asset.folder}/`;
        if (this.asset.mtl) {
            const mtlLoader = new MTLLoader();
            mtlLoader.setPath(basePath);
            mtlLoader.load(this.asset.mtl, (materials) => {
                materials.preload();
                const objLoader = new OBJLoader();
                objLoader.setMaterials(materials);
                objLoader.setPath(basePath);
                objLoader.load(this.asset.obj, (object) => {
                    this.addModel(object);
                });
            });
        } else {
            const objLoader = new OBJLoader();
            objLoader.setPath(basePath);
            objLoader.load(this.asset.obj, (object) => {
                this.addModel(object);
            });
        }
    }

    private addModel(object: THREE.Object3D) {
        // Compute bounding box
        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetSize = 1.2; // Target size for the largest dimension

        // Compute scale factor
        const scale = (this.asset.scale || 1) * (targetSize / maxDim);

        object.scale.setScalar(scale);

        // Center the model
        const center = new THREE.Vector3();
        box.getCenter(center);
        object.position.sub(center); // Move center to origin
        object.position.y -= box.min.y * scale; // Place base on "ground"

        this.scene.add(object);
        this.model = object;
        this.animate();
    }

    private animate = () => {
        if (this.model) {
            this.model.rotation.y += 0.01;
        }
        this.renderer.render(this.scene, this.camera);
        this.animationId = requestAnimationFrame(this.animate);
    };

    ngOnDestroy() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        if (this.renderer) this.renderer.dispose();
    }
}