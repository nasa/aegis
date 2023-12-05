import { FunctionComponent, useEffect, useRef } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";

import { getPresets } from "http-client/preset";
import { getPOIs } from "http-client/poi";
import { getMissions } from "http-client/mission";
import { getLayers } from "http-client/layer";
import { getStations } from "http-client/station";
import * as httpClient_action from "http-client/action";
import { getGoals, getInvestigations, getObjectives } from "http-client/stm";
import { setMapCircleControls, setMapSublayerControls } from "store/map";
import { setPois, setPoisFromDb } from "store/poi";
import {
  setPresetUIStates,
  setPresets,
  setPresetsFromDb,
  setSelectedPresetUuid,
} from "store/preset";
import { setLayers, setMission, setMissionFromDb, setSublayers } from "store/mission";
import { setStations, setStationsFromDb } from "store/station";
import { setActions, setActionsFromDb, upsertAction, upsertActionFromDb } from "store/action";
import { setGoals, setInvestigations, setObjectives } from "store/stm";
import { getEvas } from "http-client/eva";
import { setEvas, setEvasFromDb } from "store/eva";
import { setTraversesFromDb, setTraverses } from "store/traverse";
import { getTraverses } from "http-client/traverse";
import { thunkCreateStationCalculatedFields } from "store/thunk/thunkStation";
import { thunkCreateTraverseCalculatedFields } from "store/thunk/thunkTraverse";
import { thunkAuditEvas, thunkCreateEvasCalculatedFields } from "store/thunk/thunkEva";
import { thunkCreatePoiCalculatedFields } from "store/thunk/thunkPoi";
import { thunkSavePreset } from "store/thunk/thunkPreset";
import _ from "lodash";
import { getSublayers } from "http-client/sublayer";
import { thunkAuditActions } from "store/thunk/thunkAction";
import { getRexes } from "http-client/rex";
import { setRexes, setRexesFromDb } from "store/rex";
import { setRunningRexView } from "store/cross-slice";

const PopulateStore: FunctionComponent<{ missionId: number; hasPermissions: boolean }> = ({
  missionId,
  hasPermissions,
}) => {
  const missionStore = useAppSelector((state) => state.mission, shallowEqual);
  const pois = useAppSelector((state) => state.poi.pois, shallowEqual);
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const evas = useAppSelector((state) => state.eva.evas, shallowEqual);
  const presetUuids = useAppSelector(
    (state) => state.preset.presets.map((p) => p.uuid),
    shallowEqual
  );

  const stationsCalculatedFields = useAppSelector(
    (state) => state.station.calculatedFields,
    shallowEqual
  );
  const traversesCalculatedFields = useAppSelector(
    (state) => state.traverse.calculatedFields,
    shallowEqual
  );

  const actionsAudited = useRef(false);
  const evasAudited = useRef(false);

  const dispatch = useAppDispatch();

  /**
   * Populate the store
   */
  useEffect(() => {
    if (!hasPermissions) return;
    (async () => {
      //populate mission
      const missionData = await getMissions(missionId);
      if (missionData.data) {
        if (!missionData.data[0].landerRadii) {
          missionData.data[0].landerRadii = [];
        }
        dispatch(setMission(missionData.data[0]));
        dispatch(setMissionFromDb(missionData.data[0]));
      }

      //populate layers and layerControls
      const layerData = (await getLayers(missionId)).data;
      const sublayerData: Sublayer[] = (await getSublayers(missionId)).data;

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
      const presetData: Preset[] = (await getPresets(missionId)).data;
      if (presetData) {
        //fix and validate against modifications to layers/sublayers made in admin since this preset was last saved
        presetData.forEach((preset) => {
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
          });

          preset.mapCircleControls = mapCircleControls;

          dispatch(setMapCircleControls(preset.mapCircleControls));

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
      const poiData = await getPOIs(missionId);
      if (poiData.data) {
        dispatch(setPois(poiData.data));
        dispatch(setPoisFromDb(poiData.data));
      }

      //Populate stations
      const stationData = await getStations(missionId);
      if (stationData.data) {
        dispatch(setStations(stationData.data));
        dispatch(setStationsFromDb(stationData.data));
      }

      //Populate actions
      const actionData = await httpClient_action.getActions({ missionId: missionId });
      if (actionData.data) {
        dispatch(setActions(actionData.data));
        dispatch(setActionsFromDb(actionData.data));
      }

      //Populate evas
      const evaData = await getEvas(missionId);
      if (evaData.data) {
        dispatch(setEvas(evaData.data));
        dispatch(setEvasFromDb(evaData.data));
      }

      //Populate traverses
      const traverseData = await getTraverses(missionId);
      if (traverseData.data) {
        dispatch(setTraverses(traverseData.data));
        dispatch(setTraversesFromDb(traverseData.data));
      }

      //Populate stm
      const objectiveData = await getObjectives({ missionId: missionId });
      if (objectiveData.data) dispatch(setObjectives(objectiveData.data));
      const goalData = await getGoals({ missionId: missionId });
      if (goalData.data) dispatch(setGoals(goalData.data));
      const invstgData = await getInvestigations({ missionId: missionId });
      if (invstgData.data) dispatch(setInvestigations(invstgData.data));

      //Populate rex
      const rexData = await getRexes(missionId);
      if (rexData.data) {
        dispatch(setRexes(rexData.data));
        dispatch(setRexesFromDb(rexData.data));
      }

      //If REX is happening, then switch the interface to show the rex pane and EVA actions right panel
      const runningRex = rexData.data?.find((rex) => rex.rexRunning === true);
      if (runningRex) {
        dispatch(setRunningRexView({ runningRexUuid: runningRex.uuid }));
      }
    })();
  }, [dispatch, hasPermissions, missionId]);

  //Generate presetsUIStates
  useEffect(() => {
    presetUuids.forEach((presetUuid) => {
      //build preset ui states for the layer and sublayers
      const presetUIStates: PresetUIStates = {};
      for (const layer of missionStore?.layers) {
        if (!layer.uuid) continue;
        presetUIStates[layer.uuid] = {
          expanded: true,
          tabSelected: null,
          name: layer.name,
          type: "layer",
        };
      }
      for (const sublayer of missionStore?.sublayers) {
        presetUIStates[sublayer.uuid] = {
          expanded: true,
          tabSelected: null,
          name: sublayer.name,
          type: "sublayer",
        };
      }

      missionStore.mission?.landerRadii.forEach((landerRadius) => {
        presetUIStates[landerRadius.uuid] = {
          expanded: true,
          tabSelected: null,
          name: landerRadius.name,
          type: "circle",
        };
      });
      //dispatch ui states to store
      dispatch(
        setPresetUIStates({
          presetUuid: presetUuid,
          presetUIStates: presetUIStates,
        })
      );
    });
  }, [
    presetUuids,
    missionStore.layers,
    missionStore.sublayers,
    missionStore.mission?.landerRadii,
    dispatch,
  ]);

  //check if any mission equipment items don't exist in mission. For some reason there were orphaned uuids?!
  //possibly can remove this in the future. Not sure how some actions got into this state.
  useEffect(() => {
    if (!missionStore.mission?.equipmentItems || !actions) return;

    //loop through all equipment items in each action
    for (const action of actions) {
      if (!action.equipmentItemsUsage) continue;
      for (const equipItem of action.equipmentItemsUsage) {
        const found = missionStore.mission.equipmentItems.find((e) => e.uuid === equipItem.uuid);
        if (!found) {
          const newEquipItemUsage = action.equipmentItemsUsage.filter((i) =>
            missionStore.mission.equipmentItems.some((e) => e.uuid === i.uuid)
          );
          httpClient_action.upsertActions([{ ...action, equipmentItemsUsage: newEquipItemUsage }]); //update the database
          dispatch(upsertAction(action, true));
          dispatch(upsertActionFromDb(action));
          break;
        }
      }
    }
  }, [actions, missionStore.mission?.equipmentItems, dispatch]);

  //Generate poi calculated values
  useEffect(() => {
    if (_.isEmpty(pois) || !hasPermissions) return;
    dispatch(thunkCreatePoiCalculatedFields());
  }, [pois, actions, dispatch, hasPermissions]);

  //Generate station calculated values
  useEffect(() => {
    if (_.isEmpty(stations) || !hasPermissions) return;
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

  /**
   * Audit actions
   * TODO: This is a temporary fix to audit actions. This won't be needed forever but has written to be harmless if it is run more than once and everything is in order
   */
  useEffect(() => {
    if (stations.length === 0 || pois.length === 0 || actions.length === 0 || actionsAudited)
      return;
    actionsAudited.current = true;
    //audit actions
    dispatch(thunkAuditActions());
  }, [stations, pois, actions, dispatch, actionsAudited]);

  /**
   * Audit EVAs
   * TODO: This is a temporary fix to audit EVAs to add "from lander" and "to lander" traverses at the beginning and end of each EVA
   * This won't be needed forever but has written to be harmless if it is run more than once and everything is in order
   */
  useEffect(() => {
    if (_.isEmpty(evas) || _.isEmpty(traverses) || _.isEmpty(stations) || evasAudited.current)
      return;
    evasAudited.current = true;
    //audit evas
    dispatch(thunkAuditEvas());
  }, [evas, traverses, dispatch, evasAudited, stations]);

  return <></>;
};

export default PopulateStore;
