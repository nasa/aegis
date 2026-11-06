type BehavioralSublayerSeed = {
  layerUuid: string;
  uuid: string;
  name: string;
  type: SublayerType;
  path: string;
  visible: boolean;
  style?: MapSublayerStyle;
  legend?: Legend | null;
  tilePattern?: string | null;
};
