import { FunctionComponent, useState } from "react";
import PoiList from "./_poi_list";

const PoiEditorLeft: FunctionComponent = () => {
  const [expandedSections, setExpandedSections] = useState({
    systemPresets: true,
    userPresets: false,
    details: false,
  });

  return (
    <>
      <PoiList expandedSections={expandedSections} setExpandedSections={setExpandedSections} />
    </>
  );
};

export default PoiEditorLeft;
