interface Eva {
  name: string;
  evaItems: (EvaStation | EvaTraverse)[];
}

interface EvaItem {
  type: "station" | "traverse";
  name: string;
  uuid: string;
  position?: LatLng;
  latLngsJSON?: string;
}
