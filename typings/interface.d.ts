interface PaneType {
  title: string;
  leftPane: Function;
  rightPane: Function;
  color: string;
  icon: IconProp;
}

interface PaneTypes {
  [key: InterfaceSection]: PaneType;
}

interface PanelType {
  title: string;
  panel: FunctionComponent;
  selectedColor: string;
  unselectedColor?: string;
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

type saveButtonState = "enabled" | "disabled" | "pending";
