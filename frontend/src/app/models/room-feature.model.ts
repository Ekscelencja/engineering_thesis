export type WallFeatureType = 'window' | 'door';

export interface WallFeature {
  type: WallFeatureType;
  position: number;
  width: number;
  height: number;
}

export type WallSide = 'front' | 'back' | 'side' | 'top' | 'bottom' | 'hole';

export const sideMap: Record<WallSide, number> = {
  front: 0,
  back: 1,
  side: 2,
  top: 3,
  bottom: 4,
  hole: 5
};
