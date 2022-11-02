import type { NextPage } from "next";
import { useDispatch, useSelector } from "react-redux";
import styles from "./mission.module.css";
import { setLayerControls } from "store/map";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { RootState } from "store";
import { setLayers, setMission } from "../../store/mission";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { getLayers, getMission } from "../../http-client/internal-api";
import { useRouter } from "next/router";

/** Dynamically import the whole framework because nothing likes NextJS */
const LeftControlPanel = dynamic(
  import("components/interface/side-controls").then((mod) => mod.LeftControlPanel),
  {
    ssr: false,
  }
);
const RightControlPanel = dynamic(
  import("components/interface/side-controls").then((mod) => mod.RightControlPanel),
  {
    ssr: false,
  }
);
const MapBody = dynamic(import("components/interface/map-body-leafletdraw"), {
  ssr: false,
});
const Header = dynamic(import("components/interface/header"), {
  ssr: false,
});

const Main: NextPage = () => {
  const dispatch = useDispatch();
  const router = useRouter();
  const missionPage = useSelector((state: RootState) => state.mission);
  const [showRightPanel, setShowRightPanel] = useState(true);
  let layerData;
  /**
   * Populate the map layerControls store with the configLayers in the MMGIS config
   */
  useEffect(() => {
    (async () => {
      const { id } = router.query;
      if (!missionPage.mission) {
        if (typeof id === "string") {
          const missionData = await getMission(parseInt(id as string));
          if (missionData.data) {
            dispatch(setMission(missionData.data));
          }
        }
      }
      if (!missionPage.layers) {
        if (typeof id === "string") {
          const layerData = await getLayers(parseInt(id as string));
          if (layerData.data) {
            await dispatch(setLayers(layerData.data));
          }
        }
      }
      if (!layerData && missionPage.layers !== null && typeof missionPage.layers !== "undefined") {
        const controls: LayerControls = {};
        missionPage.layers.map((configLayer) => {
          controls[configLayer.config.name] = {
            name: configLayer.config.name,
            enabled: false,
            type: configLayer.config.type,
            expanded: false,
            mapLayerRef: null,
            opacity: 1,
          };
          if (configLayer.config.sublayers) {
            configLayer.config.sublayers.map((sublayer) => {
              controls[sublayer.name] = {
                name: sublayer.name,
                enabled: false,
                type: sublayer.type,
                expanded: false,
                mapLayerRef: null,
                opacity: 1,
              };
            });
          }
        });
        dispatch(setLayerControls(controls));
      }
    })();
  });

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
          {missionPage.mission && missionPage.layers && <MapBody />}
        </div>
        <div
          className={styles.drawerSlider}
          onClick={() => setShowRightPanel((prevState) => !prevState)}
        >
          <div className={styles.circle}>
            {showRightPanel ? (
              <FontAwesomeIcon className={styles.drawerIcon} color="white" icon={faChevronRight} />
            ) : (
              <FontAwesomeIcon className={styles.drawerIcon} color="white" icon={faChevronLeft} />
            )}
          </div>
        </div>
        {showRightPanel && (
          <div className={styles.rightControl}>
            <RightControlPanel />
          </div>
        )}
      </div>
      <div className={styles.timeline}>{/* <NavTimeline /> */}</div>
    </div>
  );
};

export default Main;
