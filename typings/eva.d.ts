interface Eva {
  name: string;
  evaItems: EvaItem[];
}

interface EvaItem {
  type: "station" | "traverse";
  name: string;
  uuid: string;
  latLngJSON?: string;
  latLngsJSON?: string;
  triggerAction: string;
}
