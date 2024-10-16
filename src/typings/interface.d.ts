// Add data types to window.navigator ambiently for implicit use in the entire project. See https://www.typescriptlang.org/docs/handbook/triple-slash-directives.html#-reference-types- for more info.
/// <reference types="user-agent-data-types" />

type IconProp = import("@fortawesome/fontawesome-svg-core").IconProp;

interface PaneType {
  title: string;
  leftPane: React.FunctionComponent;
  rightPane: React.FunctionComponent;
  color: string;
  icon: IconProp;
  fullScreen?: boolean;
}

type PaneTypes = {
  [key in InterfaceSection]?: PaneType;
};

interface PanelType {
  title: string;
  panel: React.FunctionComponent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  panelProps?: React.ComponentProps<any>;
  selectedColor: string;
  unselectedColor?: string;
  icon: IconProp;
  ariaLabel?: string;
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
