import { FunctionComponent, useState } from "react";
import PresetList from "./preset-user-presets";

const MapSelector: FunctionComponent = () => {
  const [expandedSections, setExpandedSections] = useState<MapExpandedSections>({
    presets: true,
  });

  return (
    <PresetList expandedSections={expandedSections} setExpandedSections={setExpandedSections} />
  );
};

export default MapSelector;
