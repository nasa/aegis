interface PaneType {
  title: string;
  pane: Function;
  color: string;
  icon: IconProp;
}

interface PaneTypes {
  [key: string]: PaneType;
}

interface PanelType {
  title: string;
  panel: Function;
  color: string;
  icon: IconProp;
}

interface PanelTypes {
  [key: string]: PanelType;
}
