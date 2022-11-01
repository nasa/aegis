import MapSelector from "components/panes/map_selector/map_selector";
import MapSelectorRight from "components/panes/map_selector/map_selector_right";
import PoiEditor from "components/panes/poi_editor/poi_editor";
import PoiEditorRight from "components/panes/poi_editor/poi_editor_right";
import EvaPlanner from "components/panes/eva_planner/eva_planner";
import EvaPlannerRight from "components/panes/eva_planner/eva_planner_right";

import { faGlobe, faRoute } from "@fortawesome/free-solid-svg-icons";
import { faCircleDot } from "@fortawesome/free-regular-svg-icons";

export const paneTypes: PaneTypes = {
  map_layer_selector: {
    title: "Map Imagery",
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
