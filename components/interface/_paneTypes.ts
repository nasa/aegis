import MapSelector from "components/panes/preset/preset";
import MapSelectorRight from "components/panes/preset/preset-right";
import PoiEditor from "components/panes/poi/poi";
import PoiEditorRight from "components/panes/poi/poi-right";
import EvaPlanner from "components/panes/eva/eva";
import EvaPlannerRight from "components/panes/eva/eva-right";

import { faGlobe, faRoute } from "@fortawesome/free-solid-svg-icons";
import { faCircleDot } from "@fortawesome/free-regular-svg-icons";

export const paneTypes: PaneTypes = {
  map_layer_selector: {
    title: "Map Display Presets",
    leftPane: MapSelector,
    rightPane: MapSelectorRight,
    color: "var(--map)",
    icon: faGlobe,
  },
  poi: {
    title: "Points of Interest",
    leftPane: PoiEditor,
    rightPane: PoiEditorRight,
    color: "var(--poi)",
    icon: faCircleDot,
  },
  eva_planner: {
    title: "EVA Planning",
    leftPane: EvaPlanner,
    rightPane: EvaPlannerRight,
    color: "var(--eva)",
    icon: faRoute,
  },
};
