// Add data types to window.navigator ambiently for implicit use in the entire project. See https://www.typescriptlang.org/docs/handbook/triple-slash-directives.html#-reference-types- for more info.
/// <reference types="user-agent-data-types" />

interface PaneType {
  title: string;
  leftPane: FunctionComponent;
  rightPane: FunctionComponent;
  color: string;
  icon: IconProp;
  fullScreen?: boolean;
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
