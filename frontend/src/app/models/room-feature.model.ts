export type WallFeatureType = 'window' | 'door';

export interface WallFeature {
  type: WallFeatureType;
  position: number; // 0-1 along wall
  width: number;
  height: number;
}