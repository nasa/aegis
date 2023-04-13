import "leaflet";
declare module "leaflet" {
  interface TileLayer {
    //add type for updateFilter from the Leaflet.Tilelayer.Colorfilter package
    updateFilter: (newfilter: any) => any;
  }
}
