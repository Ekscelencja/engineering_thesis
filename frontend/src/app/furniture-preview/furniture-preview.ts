import { Component, Input, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FurnitureAsset } from '../services/api/assets.service';

@Component({
    selector: 'app-furniture-preview',
    templateUrl: './furniture-preview.html',
    styleUrls: ['./furniture-preview.scss']
})
export class FurniturePreviewComponent implements AfterViewInit, OnDestroy {
    @Input() asset!: FurnitureAsset;
    @ViewChild('fpreview', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

    private renderer!: THREE.WebGLRenderer;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private model?: THREE.Object3D;
    private animationId?: number;
    private gltfLoader = new GLTFLoader();

    ngAfterViewInit() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, 1.2, 0.1, 100);
        this.camera.position.set(0, 2, 2.75); // Increased Z from 2 to 3 to zoom out
        this.camera.lookAt(0, 0.5, 0);

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvasRef.nativeElement, alpha: true, antialias: true });
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setSize(120, 100);

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 5, 2);
        this.scene.add(light);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        // Load GLB model
        const url = `assets/${this.asset.folder}/${this.asset.glb}`;
        this.gltfLoader.load(
            url,
            (gltf) => {
                this.addModel(gltf.scene);
            },
            undefined,
            (error) => {
                console.error(`Error loading preview for ${this.asset.name}:`, error);
            }
        );
    }

    private addModel(object: THREE.Object3D) {
        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetSize = 1.2;
        const normalizationScale = targetSize / maxDim;
        const assetScale = this.asset.scale || 1;
        object.scale.setScalar(normalizationScale * assetScale);

        const center = new THREE.Vector3();
        box.getCenter(center);
        object.position.sub(center);
        object.position.y -= box.min.y * normalizationScale * assetScale;

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