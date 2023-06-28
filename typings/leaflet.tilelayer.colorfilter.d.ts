import "leaflet";
declare module "leaflet" {
  interface TileLayer {
    //add type for updateFilter from the Leaflet.Tilelayer.Colorfilter package
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateFilter: (newfilter: any) => any;
  }
}
