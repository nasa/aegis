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
  triggerAction: string;
}

interface PaneType {
  title: string;
  pane: Function;
  color: string;
  icon: IconProp;
}

interface PaneTypes {
  [key: string]: PaneType;
}
