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
import { useRouter } from "next/router";
import { upsertPois, upsertPoisFromDb } from "store/poi";
import * as InternalAPI from "../../http-client/internal-api";
import { getMissions } from "http-client/mission";
import { getLayers } from "http-client/layer";
import { clearIronSessionData, setIronSessionData, setIsLoggedIn } from "store/user";

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
   * Check if user is logged in.
   * If so, populate the user store data.
   * If not, redirect them to the login page.
   */

  useEffect(() => {
    (async () => {
      const response = await InternalAPI.isLoggedIn();
      if (response.status === "success") {
        dispatch(setIsLoggedIn(true));
        dispatch(setIronSessionData(response.data));
      } else {
        dispatch(setIsLoggedIn(false));
        dispatch(clearIronSessionData());
        router.push("/");
      }
    })();
  }, [dispatch, router]);

  /**
   * Populate the map layerControls store with the configLayers in the MMGIS config
   */
  useEffect(() => {
    (async () => {
      const { id } = router.query;
      if (!missionPage.mission) {
        if (typeof id === "string") {
          const missionData = await getMissions(parseInt(id as string));
          if (missionData.data) {
            dispatch(setMission(missionData.data[0]));
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
          controls[configLayer.layerConfig.name] = {
            name: configLayer.layerConfig.name,
            enabled: false,
            type: configLayer.layerConfig.type,
            mapLayerRef: null,
            style: null,
          };

          if (configLayer.layerConfig.sublayers) {
            configLayer.layerConfig.sublayers.map((sublayer) => {
              controls[sublayer.name] = {
                name: sublayer.name,
                enabled: false,
                type: sublayer.type,
                mapLayerRef: null,
                style: null,
              };
            });
          }
        });
        dispatch(setLayerControls(controls));
      }
    })();
  });

  /**
   * Populate the POI store with the POIs retrieved from the database
   */
  useEffect(() => {
    (async () => {
      const { id } = router.query;
      if (typeof id === "string") {
        const poiData = await InternalAPI.getPOIs(parseInt(id as string));
        if (poiData.data) {
          dispatch(upsertPois(poiData.data));
          dispatch(upsertPoisFromDb(poiData.data));
        }
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
