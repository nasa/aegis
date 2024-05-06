import "leaflet";
declare module "leaflet" {
  interface TileLayer {
    //add type for updateFilter from the Leaflet.Tilelayer.Colorfilter package
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateFilter: (newfilter: any) => any;
  }

  //add uuid to tile layers options
  interface TileLayerOptions {
    uuid: string;
  }

  //add name and uuid to feature group
  interface FeatureGroup {
    name: string;
    uuid: string;
  }
}
