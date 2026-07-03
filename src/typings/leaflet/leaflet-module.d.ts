import type {} from "leaflet";
declare module "leaflet" {
  interface TileLayer {
    // add type for updateColorFilter from the Leaflet.Tilelayer.Colorfilter package
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateColorFilter: (newfilter: any) => any;
  }

  //add uuid to tile layers options
  interface TileLayerOptions {
    uuid: string;
    type: string;
    colorFilter: string[];
    timeInfo?: TimeLayerInfo;
  }

  //add name and uuid to feature group
  interface FeatureGroup {
    name: string;
    uuid: string;
    timeInfo?: TimeLayerInfo;
  }
}
