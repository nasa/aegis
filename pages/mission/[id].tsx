import type { NextPage } from "next";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";

import styles from "./mission.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import * as InternalAPI from "http-client/internal-api";
import { getMissions } from "http-client/mission";
import { getLayers } from "http-client/layer";
import { getStations } from "http-client/station";
import { getActions } from "http-client/action";
import { getGoals, getInvestigations, getObjectives } from "http-client/stm";
import { setLayerControls } from "store/map";
import { upsertPois, upsertPoisFromDb } from "store/poi";
import {
  setPresetInteractions,
  setSelectedPresetUuid,
  upsertPresets,
  upsertPresetsFromDb,
} from "store/preset";
import { setLayers, setMission } from "store/mission";
import { clearIronSessionData, setIronSessionData, setIsLoggedIn } from "store/user";
import { upsertStations, upsertStationsFromDb } from "store/station";
import { upsertActions, upsertActionsFromDb } from "store/action";
import { setGoals, setInvestigations, setObjectives } from "store/stm";
import { getEvas } from "http-client/eva";
import { upsertEvas, upsertEvasFromDb } from "store/eva";
import { upsertTraverses, replaceAllTraversesFromDb } from "store/traverse";
import { getTraverses } from "http-client/traverse";
import { setRightPanelOpen } from "store/interface";

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
const MapBody = dynamic(import("components/interface/map-body-leaflet"), {
  ssr: false,
});
const Header = dynamic(import("components/interface/header"), {
  ssr: false,
});

const NavTimeline = dynamic(import("components/interface/timeline"), {
  ssr: false,
});

const Main: NextPage = () => {
  const dispatch = useDispatch();
  const router = useRouter();
  const missionStore = useAppSelector((state) => state.mission, shallowEqual);
  const rightPanelOpen = useAppSelector((state) => state.interface.rightPanelOpen, refEqual);

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
   * Populate the store
   */
  useEffect(() => {
    const { id } = router.query;
    if (!id || !dispatch) return;
    (async () => {
      //populate mission
      const missionData = await getMissions(parseInt(id as string));
      if (missionData.data) {
        dispatch(setMission(missionData.data[0]));
      }

      //populate layers
      const layerData = await getLayers(parseInt(id as string));
      if (layerData.data) {
        dispatch(setLayers(layerData.data));
        //populate layerControls for the layers loaded
        const controls: LayerControls = {};
        layerData.data.map((configLayer) => {
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

      //Populate POIs
      const poiData = await InternalAPI.getPOIs(parseInt(id as string));
      if (poiData.data) {
        dispatch(upsertPois(poiData.data));
        dispatch(upsertPoisFromDb(poiData.data));
      }

      //Populate Presets
      const presetData = await InternalAPI.getPresets(parseInt(id as string));
      if (presetData.data) {
        dispatch(upsertPresets(presetData.data));
        dispatch(upsertPresetsFromDb(presetData.data));
        presetData.data.forEach((preset) => {
          const layerControlInteractions: LayerControlInteractions = {};
          for (const [key] of Object.entries(preset.layerControls)) {
            layerControlInteractions[key] = {
              expanded: true,
              tabSelected: null,
            };
          }
          dispatch(setPresetInteractions({ presetUuid: preset.uuid, layerControlInteractions }));
        });
        // Set the default preset
        const defaultPreset = presetData.data.filter(
          (preset) => preset.missionPresetDefault === true
        );
        if (defaultPreset.length > 0) {
          dispatch(setSelectedPresetUuid(defaultPreset[0].uuid));
          dispatch(setLayerControls(defaultPreset[0].layerControls));
        }
      }

      //Populate stations
      const stationData = await getStations(parseInt(id as string));
      if (stationData.data) {
        dispatch(upsertStations(stationData.data));
        dispatch(upsertStationsFromDb(stationData.data));
      }

      //Populate actions
      const actionData = await getActions({ missionId: parseInt(id as string) });
      if (actionData.data) {
        dispatch(upsertActions(actionData.data));
        dispatch(upsertActionsFromDb(actionData.data));
      }

      //Populate evas
      const evaData = await getEvas(parseInt(id as string));
      if (evaData.data) {
        dispatch(upsertEvas(evaData.data));
        dispatch(upsertEvasFromDb(evaData.data));
      }

      //Populate traverses //TODO: Does this have to load only current user's traverses?
      const traverseData = await getTraverses(parseInt(id as string));
      if (traverseData.data) {
        dispatch(upsertTraverses(traverseData.data));
        dispatch(replaceAllTraversesFromDb(traverseData.data));
      }

      //Populate stm
      const objectiveData = await getObjectives({ missionId: parseInt(id as string) });
      if (objectiveData.data) dispatch(setObjectives(objectiveData.data));
      const goalData = await getGoals({ missionId: parseInt(id as string) });
      if (goalData.data) dispatch(setGoals(goalData.data));
      const invstgData = await getInvestigations({ missionId: parseInt(id as string) });
      if (invstgData.data) dispatch(setInvestigations(invstgData.data));
    })();
  }, [router, dispatch]);

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
          {missionStore.mission && missionStore.layers && <MapBody />}
        </div>
        <div
          className={styles.drawerSlider}
          onClick={() => dispatch(setRightPanelOpen(!rightPanelOpen))}
        >
          <div className={styles.circle}>
            {rightPanelOpen ? (
              <FontAwesomeIcon className={styles.drawerIcon} color="white" icon={faChevronRight} />
            ) : (
              <FontAwesomeIcon className={styles.drawerIcon} color="white" icon={faChevronLeft} />
            )}
          </div>
        </div>
        {rightPanelOpen && (
          <div className={styles.rightControl}>
            <RightControlPanel />
          </div>
        )}
      </div>
      <div>{<NavTimeline />}</div>
    </div>
  );
};

export default Main;
