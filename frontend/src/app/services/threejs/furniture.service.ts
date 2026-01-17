import { Injectable } from '@angular/core';
import { FurnitureAsset } from '../api/assets.service';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetsService } from '../api/assets.service';

@Injectable({ providedIn: 'root' })
export class FurnitureService {
    private gltfLoader = new GLTFLoader();

    constructor(private assetsService: AssetsService) { }

    /**
     * Load furniture assets into the given Three.js scene.
     * @param furnitureList List of furniture items to load with their positions, rotations, and scales.
     * @param scene The Three.js scene to add the furniture to.
     */
    loadFurnitureIntoScene(
        furnitureList: { assetId: string; position: { x: number; y: number; z: number }; rotation: number; scale?: number }[],
        scene: THREE.Scene
    ) {
        this.assetsService.getFurnitureAssets().subscribe((assets: FurnitureAsset[]) => {
            furnitureList.forEach(f => {
                const asset = assets.find(a => a._id === f.assetId);
                if (asset) {
                    const url = `assets/${asset.folder}/${asset.glb}`;
                    this.gltfLoader.load(
                        url,
                        (gltf) => {
                            const object = gltf.scene;
                            object.scale.setScalar(f.scale ?? 1);
                            object.position.x = f.position.x;
                            object.position.y = f.position.y;
                            object.position.z = f.position.z;
                            object.rotation.y = f.rotation;
                            scene.add(object);
                        },
                        undefined,
                        (error) => {
                            console.error(`Error loading furniture ${asset.name}:`, error);
                        }
                    );
                }
            });
        });
    }
}