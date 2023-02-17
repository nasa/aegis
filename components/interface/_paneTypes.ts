import MapSelector from "components/panes/preset/preset";
import MapSelectorRight from "components/panes/preset/preset-right";
import PoiEditor from "components/panes/poi/poi";
import PoiEditorRight from "components/panes/poi/poi-right";
import EvaPlanner from "components/panes/eva/eva";
import EvaPlannerRight from "components/panes/eva/eva-right";
import StationEditor from "components/panes/station/station";
import StationEditorRight from "components/panes/station/station-right";

import { faGlobe, faLocationDot, faRoute } from "@fortawesome/free-solid-svg-icons";
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
  station: {
    title: "Stations",
    leftPane: StationEditor,
    rightPane: StationEditorRight,
    color: "var(--station)",
    icon: faLocationDot,
  },
  evas: {
    title: "EVA Compositions",
    leftPane: EvaPlanner,
    rightPane: EvaPlannerRight,
    color: "var(--eva)",
    icon: faRoute,
  },
};
