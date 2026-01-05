import { Injectable } from '@angular/core';
import { FurnitureAsset } from '../api/assets.service';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { AssetsService } from '../api/assets.service';

@Injectable({ providedIn: 'root' })
export class FurnitureService {
    constructor(private assetsService: AssetsService) { }

    loadFurnitureIntoScene(
        furnitureList: { assetId: string, position: { x: number, y: number, z: number }, rotation: number }[],
        scene: THREE.Scene
    ) {
        console.log('Loading furniture into scene:', furnitureList);
        this.assetsService.getFurnitureAssets().subscribe((assets: FurnitureAsset[]) => {
            furnitureList.forEach(f => {
                const asset = assets.find(a => a.folder === f.assetId || a._id === f.assetId);
                if (asset) {
                    const basePath = `assets/3d_objects/${asset.folder}/`;
                    const onLoaded = (object: THREE.Object3D) => {
                        const box = new THREE.Box3().setFromObject(object);
                        const center = new THREE.Vector3();
                        box.getCenter(center);
                        object.position.sub(center);
                        const newBox = new THREE.Box3().setFromObject(object);
                        object.position.y -= newBox.min.y;
                        object.scale.setScalar(asset.scale || 1);

                        object.position.x = f.position.x;
                        object.position.y = f.position.y;
                        object.position.z = f.position.z;
                        object.rotation.y = f.rotation;

                        scene.add(object);
                    };
                    if (asset.mtl) {
                        const mtlLoader = new MTLLoader();
                        mtlLoader.setPath(basePath);
                        mtlLoader.load(asset.mtl, (materials) => {
                            materials.preload();
                            const objLoader = new OBJLoader();
                            objLoader.setMaterials(materials);
                            objLoader.setPath(basePath);
                            objLoader.load(asset.obj, onLoaded);
                        });
                    } else {
                        const objLoader = new OBJLoader();
                        objLoader.setPath(basePath);
                        objLoader.load(asset.obj, onLoaded);
                    }
                } else {
                    console.warn('Asset not found for furniture:', f.assetId);
                }
            });
        });
    }
}