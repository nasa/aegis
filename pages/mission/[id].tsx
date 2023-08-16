import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";

import styles from "./mission.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { getPresets } from "http-client/preset";
import { getPOIs } from "http-client/poi";
import { getMissions } from "http-client/mission";
import { getLayers } from "http-client/layer";
import { getStations } from "http-client/station";
import { getActions } from "http-client/action";
import { getGoals, getInvestigations, getObjectives } from "http-client/stm";
import { setMapCircleControls, setMapSublayerControls } from "store/map";
import { setPois, setPoisFromDb, upsertPoi, upsertPoiFromDb } from "store/poi";
import {
  setPresetUIStates,
  setPresets,
  setPresetsFromDb,
  setSelectedPresetUuid,
} from "store/preset";
import { setLayers, setMission, setMissionFromDb, setSublayers } from "store/mission";
import { setStations, setStationsFromDb, upsertStation, upsertStationFromDb } from "store/station";
import { setActions, setActionsFromDb } from "store/action";
import { setGoals, setInvestigations, setObjectives } from "store/stm";
import { getEvas } from "http-client/eva";
import { setEvas, setEvasFromDb } from "store/eva";
import { setTraversesFromDb, setTraverses } from "store/traverse";
import { getTraverses } from "http-client/traverse";
import { setRightPanelOpen } from "store/interface";
import { setMissionPerms, setUserStore } from "store/user";
import { thunkCreateStationCalculatedFields } from "store/thunk/thunkStation";
import { thunkCreateTraverseCalculatedFields } from "store/thunk/thunkTraverse";
import { thunkCreateEvasCalculatedFields } from "store/thunk/thunkEva";
import { thunkCreatePoiCalculatedFields } from "store/thunk/thunkPoi";
import { Tooltip } from "react-tooltip";
import { thunkSavePreset } from "store/thunk/thunkPreset";
import _ from "lodash";
import { isLoggedIn } from "http-client/login";
import { getSublayers } from "http-client/sublayer";
import * as httpClient_station from "http-client/station";
import * as httpClient_poi from "http-client/poi";

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
const SunEarthPosition = dynamic(import("components/interface/map-sunearth"), {
  ssr: false,
});
const Header = dynamic(import("components/interface/header"), {
  ssr: false,
});

const BottomControlPanel = dynamic(
  import("components/interface/side-controls").then((mod) => mod.BottomControlPanel),
  {
    ssr: false,
  }
);

const Main: NextPage = () => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const missionStore = useAppSelector((state) => state.mission, shallowEqual);
  const rightPanelOpen = useAppSelector((state) => state.interface.rightPanelOpen, refEqual);
  const pois = useAppSelector((state) => state.poi.pois, shallowEqual);
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const evas = useAppSelector((state) => state.eva.evas, shallowEqual);

  const stationsCalculatedFields = useAppSelector(
    (state) => state.station.calculatedFields,
    shallowEqual
  );
  const traversesCalculatedFields = useAppSelector(
    (state) => state.traverse.calculatedFields,
    shallowEqual
  );

  //local state to ensure permissions have been checked first before running the other useEffects
  const [hasPermissions, setHasPermissions] = useState(false);

  const { id } = router.query;
  const intMissionId = parseInt(Array.isArray(id) ? id[0] : id);

  /**
   * Check if user is logged in and if the user has permissions for this mission page
   * If not, redirect them to the home page.
   */

  useEffect(() => {
    if (!intMissionId) return;
    (async () => {
      const response = await isLoggedIn();
      //Check if user is logged in.
      if (response.status === "success") {
        dispatch(setUserStore({ isLoggedIn: true, user: response.data.user, missionPerms: null }));

        //Check for permissions to this mission
        if (response.data.user.isSuperAdmin) {
          //super admin always has permissions
          dispatch(
            setMissionPerms({ missionId: intMissionId, permissions: { view: true, edit: true } })
          );
        } else {
          const perms = response.data.user.permissionList?.find(
            (permission) => permission.missionId === intMissionId
          );
          if (!perms || (!perms.permissions.view && !perms.permissions.edit)) router.push("/"); //Redirect to homepage
          dispatch(setMissionPerms(perms));
        }
        setHasPermissions(true);
      } else {
        router.push("/");
      }
    })();
  }, [router, intMissionId, dispatch]);

  /**
   * Populate the store
   */
  useEffect(() => {
    if (!hasPermissions) return;
    (async () => {
      //populate mission
      const missionData = await getMissions(intMissionId);
      if (missionData.data) {
        if (!missionData.data[0].landerRadii) {
          missionData.data[0].landerRadii = [];
        }
        dispatch(setMission(missionData.data[0]));
        dispatch(setMissionFromDb(missionData.data[0]));
      }

      //populate layers and layerControls
      const layerData = (await getLayers(intMissionId)).data;
      const sublayerData: Sublayer[] = (await getSublayers(intMissionId)).data;

      const missionMapSublayerControls: MapSublayerControls = {}; //map sublayer controls generated from mission sublayers
      if (layerData) {
        //populate layers and sublayers to store
        dispatch(setLayers(layerData));
        dispatch(setSublayers(sublayerData));

        //build map sublayerControls from mission data
        sublayerData.map((sublayer) => {
          missionMapSublayerControls[sublayer.uuid] = {
            name: sublayer.name,
            sublayerUuid: sublayer.uuid,
            visible: false,
            style: {
              opacity: sublayer.opacity || 1,
              contrast: 1,
              brightness: 1,
              saturation: 1,
              blendMode: "normal",
              color: sublayer.color || "#FFFFFF",
              weight: sublayer.weight || 1,
              fillColor: sublayer.fillColor || "#FFFFFF",
              fillOpacity: sublayer.fillOpacity || 0.2,
            },
          };
        });
        //save to store
        dispatch(setMapSublayerControls(missionMapSublayerControls));
      }

      //Populate Presets
      const presetData: Preset[] = (await getPresets(intMissionId)).data;
      if (presetData) {
        //fix and validate against modifications to layers/sublayers made in admin since this preset was last saved
        presetData.forEach((preset) => {
          //build preset ui states for the layer and sublayers
          const presetUIStates: PresetUIStates = {};
          for (const layer of layerData) {
            presetUIStates[layer.uuid] = {
              expanded: true,
              tabSelected: null,
              name: layer.name,
              type: "layer",
            };
          }
          for (const sublayer of sublayerData) {
            presetUIStates[sublayer.uuid] = {
              expanded: true,
              tabSelected: null,
              name: sublayer.name,
              type: "sublayer",
            };
          }

          let modified = false;
          //sync up anything added/deleted missing from preset layer order
          if (preset.layerOrder) {
            //delete any header layers in layerOrder removed from mission
            const filteredNewLayerOrders = preset.layerOrder.filter((layerOrder) =>
              layerData.some((l) => l.uuid === layerOrder.layerUuid)
            );
            if (!_.isEqual(filteredNewLayerOrders, preset.layerOrder)) modified = true;
            preset.layerOrder = filteredNewLayerOrders;

            //add any missing header layers and sublayers to layerOrder from mission
            for (const headerLayer of layerData) {
              const newHeaderLayerOrder = preset.layerOrder.find(
                (layerOrder) => layerOrder.layerUuid === headerLayer.uuid
              );
              const sublayers = sublayerData.filter(
                (sublayer) => sublayer.layerUuid === headerLayer.uuid
              );
              if (newHeaderLayerOrder) {
                //it exists, good. check sublayers
                //add any missing sublayers
                for (const sublayer of sublayers) {
                  const hasSublayer = newHeaderLayerOrder.sublayerUuids.some(
                    (uuid) => uuid === sublayer.uuid
                  );
                  if (!hasSublayer) {
                    newHeaderLayerOrder.sublayerUuids.push(sublayer.uuid);
                    modified = true;
                  }
                }

                //delete any removed sublayers
                const newSublayerUuids = newHeaderLayerOrder.sublayerUuids.filter(
                  (sublayerOrderUuid) => sublayers.some((s) => s.uuid === sublayerOrderUuid)
                );
                if (!_.isEqual(newSublayerUuids, newHeaderLayerOrder.sublayerUuids))
                  modified = true;
                newHeaderLayerOrder.sublayerUuids = newSublayerUuids;
              } else {
                //add missing header layer and all it's sublayers
                const tempLayerOrder = {
                  layerUuid: headerLayer.uuid,
                  sublayerUuids: sublayers.map((s) => s.uuid),
                };
                preset.layerOrder.push(tempLayerOrder);
                modified = true;
              }
            }
          }

          //loop through sublayers, add any sublayers that are missing from preset map controls
          //  this happens when sublayers are added in mission after the preset was created
          for (const sublayer of sublayerData) {
            //add to sublayer control
            if (!Object.keys(preset.mapSublayerControls).includes(sublayer.uuid)) {
              preset.mapSublayerControls[sublayer.uuid] = missionMapSublayerControls[sublayer.uuid];
              modified = true;
            }
          }

          //loop through preset mapSublayerControls and delete any sublayer data that no longer exist in mission
          //  this happens when sublayers are deleted in mission after the preset was created
          for (const sublayerUuid of Object.keys(preset.mapSublayerControls)) {
            //delete from sublayer control
            if (!Object.keys(missionMapSublayerControls).includes(sublayerUuid)) {
              delete preset.mapSublayerControls[sublayerUuid];
              modified = true;
            }
          }

          //set map circle controls
          const mapCircleControls: MapCircleControls = {};
          if (!preset.mapCircleControls) {
            preset.mapCircleControls = {};
            modified = true;
          }

          missionData.data[0].landerRadii.forEach((landerRadius) => {
            if (preset.mapCircleControls[landerRadius.uuid]) {
              mapCircleControls[landerRadius.uuid] = preset.mapCircleControls[landerRadius.uuid];
            } else {
              modified = true;
              mapCircleControls[landerRadius.uuid] = {
                name: landerRadius.name,
                landerRadiusUuid: landerRadius.uuid,
                visible: false,
                style: {
                  opacity: 1,
                  contrast: 1,
                  brightness: 1,
                  saturation: 1,
                  blendMode: "normal",
                  color: "red",
                  weight: 1,
                  fillColor: "none",
                  fillOpacity: 0,
                },
              };
            }
            presetUIStates[landerRadius.uuid] = {
              expanded: true,
              tabSelected: null,
              name: landerRadius.name,
              type: "circle",
            };
          });

          preset.mapCircleControls = mapCircleControls;

          dispatch(setMapCircleControls(preset.mapCircleControls));

          //dispatch ui states to store
          dispatch(
            setPresetUIStates({
              presetUuid: preset.uuid,
              presetUIStates: presetUIStates,
            })
          );

          //update this preset in the DB
          if (modified) dispatch(thunkSavePreset({ preset }));
        });

        //save preset data to the store
        dispatch(setPresets(presetData));
        dispatch(setPresetsFromDb(presetData));

        // Set the default preset
        const defaultPreset = presetData.filter((preset) => preset.missionPresetDefault === true);
        if (defaultPreset.length > 0) {
          dispatch(setSelectedPresetUuid(defaultPreset[0].uuid));
          dispatch(setMapSublayerControls(defaultPreset[0].mapSublayerControls));
        }
      }

      //Populate POIs
      const poiData = await getPOIs(intMissionId);
      if (poiData.data) {
        dispatch(setPois(poiData.data));
        dispatch(setPoisFromDb(poiData.data));
      }

      //Populate stations
      const stationData = await getStations(intMissionId);
      if (stationData.data) {
        dispatch(setStations(stationData.data));
        dispatch(setStationsFromDb(stationData.data));
      }

      //Populate actions
      const actionData = await getActions({ missionId: intMissionId });
      if (actionData.data) {
        dispatch(setActions(actionData.data));
        dispatch(setActionsFromDb(actionData.data));
      }

      //Populate evas
      const evaData = await getEvas(intMissionId);
      if (evaData.data) {
        dispatch(setEvas(evaData.data));
        dispatch(setEvasFromDb(evaData.data));
      }

      //Populate traverses
      const traverseData = await getTraverses(intMissionId);
      if (traverseData.data) {
        dispatch(setTraverses(traverseData.data));
        dispatch(setTraversesFromDb(traverseData.data));
      }

      //Populate stm
      const objectiveData = await getObjectives({ missionId: intMissionId });
      if (objectiveData.data) dispatch(setObjectives(objectiveData.data));
      const goalData = await getGoals({ missionId: intMissionId });
      if (goalData.data) dispatch(setGoals(goalData.data));
      const invstgData = await getInvestigations({ missionId: intMissionId });
      if (invstgData.data) dispatch(setInvestigations(invstgData.data));
    })();
  }, [dispatch, hasPermissions, intMissionId]);

  //Generate poi calculated values
  useEffect(() => {
    if (_.isEmpty(pois) || _.isEmpty(actions) || !hasPermissions) return;
    dispatch(thunkCreatePoiCalculatedFields());
  }, [pois, actions, dispatch, hasPermissions]);

  //Generate station calculated values
  useEffect(() => {
    if (_.isEmpty(stations) || _.isEmpty(actions) || !hasPermissions) return;
    dispatch(thunkCreateStationCalculatedFields());
  }, [stations, actions, dispatch, hasPermissions]);

  //Generate traverse calculated values
  useEffect(() => {
    if (_.isEmpty(traverses) || !hasPermissions) return;
    dispatch(thunkCreateTraverseCalculatedFields());
  }, [traverses, dispatch, hasPermissions]);

  //Generate eva calculated values. These are dependent on stations and traverses having had their calculated values generated
  useEffect(() => {
    if (
      _.isEmpty(evas) ||
      _.isEmpty(stationsCalculatedFields) ||
      _.isEmpty(traversesCalculatedFields) ||
      !hasPermissions
    )
      return;
    dispatch(thunkCreateEvasCalculatedFields());
  }, [evas, stationsCalculatedFields, traversesCalculatedFields, dispatch, hasPermissions]);

  // Audit actionOrderUuid values and update if necessary
  useEffect(() => {
    if (!stations || !pois || !actions) return;
    for (const station of stations) {
      const actionsInStation = actions.filter((action) => action.stationUuid === station.uuid);
      const newActionOrderUuids = _.cloneDeep(station.actionOrderUuids);
      for (const action of actionsInStation) {
        if (!station.actionOrderUuids.includes(action.uuid)) {
          newActionOrderUuids.push(action.uuid);
        }
      }
      if (!_.isEqual(newActionOrderUuids, station.actionOrderUuids)) {
        httpClient_station.upsertStation({
          ...station,
          actionOrderUuids: newActionOrderUuids,
        });
        dispatch(upsertStation({ ...station, actionOrderUuids: newActionOrderUuids }, true));
        dispatch(upsertStationFromDb({ ...station, actionOrderUuids: newActionOrderUuids }));
      }
    }

    for (const poi of pois) {
      const actionsInPoi = actions.filter((action) => action.poiUuid === poi.uuid);
      const newActionOrderUuids = _.cloneDeep(poi.actionOrderUuids);
      for (const action of actionsInPoi) {
        if (!poi.actionOrderUuids.includes(action.uuid)) {
          newActionOrderUuids.push(action.uuid);
        }
      }
      if (!_.isEqual(newActionOrderUuids, poi.actionOrderUuids)) {
        httpClient_poi.upsertPOI({
          ...poi,
          actionOrderUuids: newActionOrderUuids,
        });
        dispatch(upsertPoi({ ...poi, actionOrderUuids: newActionOrderUuids }, true));
        dispatch(upsertPoiFromDb({ ...poi, actionOrderUuids: newActionOrderUuids }));
      }
    }
  }, [stations, pois, actions, dispatch]);

  const showSunEarth: boolean =
    missionStore.mission &&
    (missionStore.mission.earthAzimuthVisible || missionStore.mission.sunAzimuthVisible);

  return (
    <>
      {hasPermissions && (
        <div className={styles.page}>
          <Tooltip
            id="aegis-tooltip"
            className={styles.tooltip}
            clickable={true}
            delayShow={1000}
          />
          <div className={styles.header}>
            <Header />
          </div>
          <div className={styles.body}>
            <div className={styles.leftControl}>
              <LeftControlPanel />
            </div>
            <div className={styles.mapBody}>
              {missionStore.mission && missionStore.layers && <MapBody />}
              {showSunEarth && <SunEarthPosition />}
            </div>
            <div
              className={styles.drawerSlider}
              onClick={() => dispatch(setRightPanelOpen(!rightPanelOpen))}
            >
              <div className={styles.circle}>
                {rightPanelOpen ? (
                  <FontAwesomeIcon
                    className={styles.drawerIcon}
                    color="white"
                    icon={faChevronRight}
                  />
                ) : (
                  <FontAwesomeIcon
                    className={styles.drawerIcon}
                    color="white"
                    icon={faChevronLeft}
                  />
                )}
              </div>
            </div>
            {rightPanelOpen && (
              <div className={styles.rightControl}>
                <RightControlPanel />
              </div>
            )}
          </div>
          <div className={styles.bottomControl}>
            <BottomControlPanel />
          </div>
        </div>
      )}
    </>
  );
};

export default Main;
