import type { NextPage } from "next";
import { useDispatch, useSelector } from "react-redux";
import styles from "./main.module.css";
import { setLayerControls } from "store/map";

import dynamic from "next/dynamic";
// import NavTimeline from "components/interface/nav-timeline";
import { useEffect } from "react";
import { RootState } from "store";
/** Dynamically import the whole framework because nothing likes NextJS */
const LeftControlPanel = dynamic(import("components/interface/left-control"), {
  ssr: false,
});
const RightControlPanel = dynamic(import("components/interface/right-control"), {
  ssr: false,
});
const MapBody = dynamic(import("components/interface/map-body-leafletdraw"), {
  ssr: false,
});
const Header = dynamic(import("components/interface/header"), {
  ssr: false,
});

const Main: NextPage = () => {
  const dispatch = useDispatch();
  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig);

  /**
   * Populate the map layerControls store with the configLayers in the MMGIS config
   */
  useEffect(() => {
    if (!mmgisConfig) return;
    const configLayers = mmgisConfig?.MMGISConfig?.config?.layers;

    if (!configLayers) return;
    const controls: LayerControls = {};

    /**
     * Make configLayer store
     */
    configLayers.map((configLayer) => {
      const layerControl: LayerControl = {
        name: configLayer.name,
        enabled: false,
        type: configLayer.type,
        expanded: false,
        mapLayerRef: null,
        opacity: 1,
      };
      controls[configLayer.name] = layerControl;
      if (configLayer.sublayers) {
        configLayer.sublayers.map((sublayer) => {
          const layerControl: LayerControl = {
            name: sublayer.name,
            enabled: false,
            type: sublayer.type,
            expanded: false,
            mapLayerRef: null,
            opacity: 1,
          };
          controls[sublayer.name] = layerControl;
        });
      }
    });
    dispatch(setLayerControls(controls));
  }, [mmgisConfig, dispatch]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Header />
      </div>
      <div className={styles.body}>
        <div className={styles.leftControl}>
          <LeftControlPanel />
        </div>
        <div className={styles.mapBody}>
          <MapBody />
        </div>
        <div className={styles.rightControl}>
          <RightControlPanel />
        </div>
      </div>
      <div className={styles.timeline}>{/* <NavTimeline /> */}</div>
    </div>
  );
};

export default Main;
