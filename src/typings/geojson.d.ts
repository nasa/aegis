import type { GeoJsonGeometryTypes, GeoJsonProperties, GeoJsonTypes, Feature } from "geojson";

interface GeoJsonFeature {
  type: GeoJsonTypes;
  geometry: {
    type: GeoJsonGeometryTypes;
    coordinates: number[];
  };
  properties: GeoJsonProperties;
}

interface GeoJsonFile {
  type: GeoJsonTypes;
  features: Feature[];
  _metadata: {
    name: string;
    file_description: string;
    file_owner: string;
    public: boolean;
    hidden: boolean;
  };
}
