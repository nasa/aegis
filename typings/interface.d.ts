interface PaneType {
  title: string;
  leftPane: Function;
  rightPane: Function;
  color: string;
  icon: IconProp;
}

interface PaneTypes {
  [key: string]: PaneType;
}

interface PanelType {
  title: string;
  panel: FunctionComponent;
  color: string;
  icon: IconProp;
  panelGroup?: string[];
}

interface PanelTypes {
  [key: string]: PanelType;
}

interface Option {
  name: string;
  value: string;
}
