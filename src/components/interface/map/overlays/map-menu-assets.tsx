import type { FunctionComponent } from "react";
import assetsMenuStyles from "./map-menu-assets.module.css";

// Content of the "Assets" tab in the floating Rex Menu widget on the map.
export const MapAssetsMenu: FunctionComponent = () => {
  return (
    <div className={assetsMenuStyles.assetsMenu} data-testid="assets-map-menu">
      <div className={assetsMenuStyles.comingSoon}>Asset Management Coming Soon</div>
    </div>
  );
};
