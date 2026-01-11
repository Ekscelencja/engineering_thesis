import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface FurnitureAsset {
  _id: string;
  name: string;
  folder: string;
  obj: string;
  mtl?: string;
  scale: number;
}

export interface TextureAsset {
  _id: string;
  name: string;
  file: string;
  type: 'floor' | 'wall';
  previewImage?: string;
}

@Injectable({ providedIn: 'root' })
export class AssetsService {
  private apiUrl = '/api/assets';
  constructor(private http: HttpClient) {}

  getFurnitureAssets(): Observable<FurnitureAsset[]> {
    return this.http.get<FurnitureAsset[]>(`${this.apiUrl}/furniture`);
  }

  getTextureAssets(type?: 'floor' | 'wall'): Observable<TextureAsset[]> {
    return this.http.get<TextureAsset[]>(`${this.apiUrl}/textures`, { params: type ? { type } : {} });
  }
}