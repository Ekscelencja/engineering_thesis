export type WallFeatureType = 'window' | 'door';

export interface WallFeature {
  type: WallFeatureType;
  position: number;
  width: number;
  height: number;
}