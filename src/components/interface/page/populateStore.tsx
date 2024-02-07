import { FunctionComponent, useEffect, useRef } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import { setMapCircleControls, setMapSublayerControls } from "store/map";
import { setPois, setPoisFromDb, setPoiLoadingStatus } from "store/poi";
import {
  setPresetLoadingStatus,
  setPresetUIStates,
  setPresets,
  setPresetsFromDb,
  setSelectedPresetUuid,
} from "store/preset";
import {
  setLayers,
  setMission,
  setMissionFromDb,
  setSublayers,
  setMissionLoadingStatus,
} from "store/mission";
import { setStations, setStationsFromDb, setStationLoadingStatus } from "store/station";
import { setActions, setActionsFromDb, setActionLoadingStatus } from "store/action";
import { setGoals, setInvestigations, setObjectives, setStmLoadingStatus } from "store/stm";
import { setEvaLoadingStatus, setEvas, setEvasFromDb } from "store/eva";
import { setTraversesFromDb, setTraverses, setTraverseLoadingStatus } from "store/traverse";
import { thunkCreateStationCalculatedFields } from "store/thunk/thunkStation";
import { thunkCreateTraverseCalculatedFields } from "store/thunk/thunkTraverse";
import { thunkAuditEvas, thunkCreateEvasCalculatedFields } from "store/thunk/thunkEva";
import { thunkCreatePoiCalculatedFields } from "store/thunk/thunkPoi";
import { thunkSavePreset } from "store/thunk/thunkPreset";
import _ from "lodash";
import { thunkAuditActions } from "store/thunk/thunkAction";
import { setRexLoadingStatus, setRexes, setRexesFromDb } from "store/rex";
import { thunkSetAllStoreLoadingStatuses, thunkSetRunningRexView } from "store/thunk/crossThunk";
import { getAll } from "http-client/all";
import { thunkAuditRexPositions } from "store/thunk/thunkRex";

const PopulateStore: FunctionComponent<{ missionId: number; hasPermissions: boolean }> = ({
  missionId,
  hasPermissions,
}) => {
  const missionStore = useAppSelector((state) => state.mission, shallowEqual);
  const missionTraverseRate = useAppSelector(
    (state) => state.mission.mission?.traverseRate,
    refEqual
  );
  const poisLoadingStatus = useAppSelector((state) => state.poi.loadingStatus, refEqual);
  const poisFieldsForCalc = useAppSelector(
    (state) => state.poi.pois.map((p) => p.uuid),
    shallowEqual
  );
  const stationsLoadingStatus = useAppSelector((state) => state.station.loadingStatus, refEqual);
  const stationsFieldsForCalc = useAppSelector(
    (state) =>
      state.station.stations.map((s) => {
        return {
          location: s.location,
          durationLower: s.durationLower,
          durationUpper: s.durationUpper,
          poiUuids: s.poiUuids,
          walkbackPathSegmentDistances: s.walkbackPathSegmentDistances,
          walkbackPathSegmentElevations: s.walkbackPathSegmentElevations,
        };
      }),
    deepEqual
  );
  const actionsLoadingStatus = useAppSelector((state) => state.action.loadingStatus, refEqual);
  const stationsActions = useAppSelector(
    (state) =>
      state.action.actions
        .filter((a) => a.stationUuid)
        .map((a) => {
          return {
            durationLower: a.durationLower,
            durationUpper: a.durationUpper,
            crewAssigned: a.crewAssigned,
            enabled: a.enabled,
            equipmentItemsUsage: a.equipmentItemsUsage,
          };
        }),
    deepEqual
  );
  const poiActions = useAppSelector(
    (state) =>
      state.action.actions
        .filter((a) => a.poiUuid)
        .map((a) => {
          return {
            durationLower: a.durationLower,
            durationUpper: a.durationUpper,
            crewAssigned: a.crewAssigned,
            enabled: a.enabled,
          };
        }),
    deepEqual
  );
  const traverseLoadingStatus = useAppSelector((state) => state.traverse.loadingStatus, refEqual);
  const traversesFieldsForCalc = useAppSelector(
    (state) =>
      state.traverse.traverses.map((t) => {
        return {
          traverseRate: t.traverseRate,
          pathSegmentDistances: t.pathSegmentDistances,
          pathSegmentElevations: t.pathSegmentElevations,
          predictedDurationLower: t.predictedDurationLower,
          predictedDurationUpper: t.predictedDurationUpper,
        };
      }),
    deepEqual
  );
  const evaLoadingStatus = useAppSelector((state) => state.eva.loadingStatus, refEqual);
  const evasFieldsForCalc = useAppSelector(
    (state) =>
      state.eva.evas.map((e) => {
        return {
          sequence: e.sequence,
          egressDuration: e.egressDuration,
          ingressDuration: e.ingressDuration,
          maxDuration: e.maxDuration,
        };
      }),
    deepEqual
  );
  const stmLoadingStatus = useAppSelector((state) => state.stm.loadingStatus, refEqual);
  const rexLoadingStatus = useAppSelector((state) => state.rex.loadingStatus, refEqual);
  const presetUuids = useAppSelector(
    (state) => state.preset.presets.map((p) => p.uuid),
    shallowEqual
  );
  const rexes = useAppSelector((state) => state.rex.rexes, shallowEqual);

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
  const rexPosAudited = useRef(false);

  const dispatch = useAppDispatch();

  /**
   * Populate the store
   */
  useEffect(() => {
    if (!hasPermissions) return;
    (async () => {
      //get all data for a mission from a single endpoint
      dispatch(thunkSetAllStoreLoadingStatuses({ loadingStatus: "loading" }));
      const allDataRes: WrappedResponse<OneMissionToRuleThemAll> = await getAll(missionId);
      if (allDataRes.status !== "success" || !allDataRes.data) {
        dispatch(thunkSetAllStoreLoadingStatuses({ loadingStatus: "error" }));
        return;
      } //gracefully handle an error if no data is returned?

      //populate mission
      const missionData = allDataRes.data.mission;
      if (missionData) {
        if (!missionData.landerRadii) {
          missionData.landerRadii = [];
        }
        dispatch(setMission(missionData));
        dispatch(setMissionFromDb(missionData));
      }

      //populate layers and layerControls
      const layerData: Layer[] = allDataRes.data.layers;
      const sublayerData: Sublayer[] = allDataRes.data.sublayers;

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
              fillOpacity: sublayer.fillOpacity || 0,
            },
          };
        });
        //save to store
        dispatch(setMapSublayerControls(missionMapSublayerControls));
      }
      dispatch(setMissionLoadingStatus("loaded"));

      //Populate Presets
      const presetData: Preset[] = allDataRes.data.presets;
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

          missionData.landerRadii.forEach((landerRadius) => {
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
      dispatch(setPresetLoadingStatus("loaded"));

      //Populate POIs
      const poiData = allDataRes.data.pois;
      if (poiData) {
        dispatch(setPois(poiData));
        dispatch(setPoisFromDb(poiData));
      }
      dispatch(setPoiLoadingStatus("loaded"));

      //Populate stations
      const stationData = allDataRes.data.stations;
      if (stationData) {
        dispatch(setStations(stationData));
        dispatch(setStationsFromDb(stationData));
      }
      dispatch(setStationLoadingStatus("loaded"));

      //Populate actions
      const actionData = allDataRes.data.actions;
      if (actionData) {
        dispatch(setActions(actionData));
        dispatch(setActionsFromDb(actionData));
      }
      dispatch(setActionLoadingStatus("loaded"));

      //Populate evas
      const evaData = allDataRes.data.evas;
      if (evaData) {
        dispatch(setEvas(evaData));
        dispatch(setEvasFromDb(evaData));
      }
      dispatch(setEvaLoadingStatus("loaded"));

      //Populate traverses
      const traverseData = allDataRes.data.traverses;
      if (traverseData) {
        dispatch(setTraverses(traverseData));
        dispatch(setTraversesFromDb(traverseData));
      }
      dispatch(setTraverseLoadingStatus("loaded"));

      //Populate stm
      const objectiveData = allDataRes.data.objectives;
      if (objectiveData) dispatch(setObjectives(objectiveData));
      const goalData = allDataRes.data.goals;
      if (goalData) dispatch(setGoals(goalData));
      const invstgData = allDataRes.data.invstgs;
      if (invstgData) dispatch(setInvestigations(invstgData));
      dispatch(setStmLoadingStatus("loaded"));

      //Populate rex
      const rexData = allDataRes.data.rexes;
      if (rexData) {
        dispatch(setRexes(rexData));
        dispatch(setRexesFromDb(rexData));

        //If REX is happening, then switch the interface to show the rex pane and EVA actions right panel
        const runningRex = rexData.find((rex) => rex.isRunning === true);
        if (runningRex) {
          dispatch(thunkSetRunningRexView({ runningRexUuid: runningRex.uuid }));
        }
      }
      dispatch(setRexLoadingStatus("loaded"));
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

  //Generate poi calculated values
  useEffect(() => {
    if (poisLoadingStatus !== "loaded" || actionsLoadingStatus !== "loaded" || !hasPermissions)
      return;
    dispatch(thunkCreatePoiCalculatedFields());
  }, [
    poisLoadingStatus,
    actionsLoadingStatus,
    poisFieldsForCalc,
    poiActions,
    dispatch,
    hasPermissions,
  ]);

  //Generate station calculated values
  useEffect(() => {
    if (stationsLoadingStatus !== "loaded" || actionsLoadingStatus !== "loaded" || !hasPermissions)
      return;
    dispatch(thunkCreateStationCalculatedFields());
  }, [
    stationsLoadingStatus,
    actionsLoadingStatus,
    stationsFieldsForCalc,
    stationsActions,
    dispatch,
    hasPermissions,
  ]);

  //Generate traverse calculated values
  useEffect(() => {
    if (traverseLoadingStatus !== "loaded" || !hasPermissions) return;
    dispatch(thunkCreateTraverseCalculatedFields());
  }, [
    traverseLoadingStatus,
    traversesFieldsForCalc,
    missionTraverseRate,
    dispatch,
    hasPermissions,
  ]);

  //Generate eva calculated values. These are dependent on stations and traverses having had their calculated values generated
  useEffect(() => {
    if (
      evaLoadingStatus !== "loaded" ||
      _.isEmpty(stationsCalculatedFields) ||
      _.isEmpty(traversesCalculatedFields) ||
      !hasPermissions
    )
      return;
    dispatch(thunkCreateEvasCalculatedFields());
  }, [
    evaLoadingStatus,
    stationsCalculatedFields,
    traversesCalculatedFields,
    evasFieldsForCalc,
    dispatch,
    hasPermissions,
  ]);

  /**
   * Audit actions
   * TODO: This is a temporary fix to audit actions. This won't be needed forever but has written to be harmless if it is run more than once and everything is in order
   */
  useEffect(() => {
    // check if store has been populated
    if (
      missionStore.loadingStatus !== "loaded" ||
      stationsLoadingStatus !== "loaded" ||
      poisLoadingStatus !== "loaded" ||
      actionsLoadingStatus !== "loaded" ||
      stmLoadingStatus !== "loaded" ||
      actionsAudited.current
    )
      return;

    actionsAudited.current = true;
    dispatch(thunkAuditActions());
  }, [
    dispatch,
    stationsLoadingStatus,
    poisLoadingStatus,
    actionsLoadingStatus,
    stmLoadingStatus,
    missionStore.loadingStatus,
    actionsAudited,
  ]);

  /**
   * Audit EVAs
   * TODO: This is a temporary fix to audit EVAs to add "from lander" and "to lander" traverses at the beginning and end of each EVA
   * This won't be needed forever but has written to be harmless if it is run more than once and everything is in order
   */
  useEffect(() => {
    if (
      evaLoadingStatus !== "loaded" ||
      traverseLoadingStatus !== "loaded" ||
      stationsLoadingStatus !== "loaded" ||
      evasAudited.current
    )
      return;
    evasAudited.current = true;
    //audit evas
    dispatch(thunkAuditEvas());
  }, [evaLoadingStatus, traverseLoadingStatus, dispatch, evasAudited, stationsLoadingStatus]);

  /**
   * Audit REX positions
   * TODO: This is a temporary fix to audit REX positions to conver them from the old hard coded EV1, EV2, Cart format to the new flexible type format
   */
  useEffect(() => {
    if (rexLoadingStatus !== "loaded") return;

    // audit crew positions
    dispatch(thunkAuditRexPositions());

    rexPosAudited.current = true;
  }, [rexes, rexLoadingStatus, dispatch]);

  return <></>;
};

export default PopulateStore;
