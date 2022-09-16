interface Eva {
  name: string;
  evaItems: EvaItem[];
}

interface EvaItem {
  type: "lander" | "station" | "traverse";
  name: string;
  uuid: string;
  latLngJSON?: string;
  latLngsJSON?: string;
  mapAction: string;
}
