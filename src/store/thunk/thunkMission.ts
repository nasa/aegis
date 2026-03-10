import appCreateAsyncThunk from "./thunkUtil";
import { thunkGetElevation } from "./thunkElevation";
import { thunkFullUpdateWalkback, thunkSaveStation } from "./thunkStation";
import { getAccurateNow } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import {
  makeExportMission,
  makeExportActions,
  makeExportEvas,
  makeExportPois,
  makeExportRexes,
  makeExportStations,
  makeExportTraverses,
} from "utils/export";
import * as jsonKeysSort from "json-keys-sort";
import { globalGrid } from "utils/mapping/grid";
import { thunkFullUpdateTraverse } from "./thunkTraverse";
import { getAutomergeDocHandles } from "client/automergeDocHandles";

export const thunkUpdateLanderLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
}>("updateLanderLocation", async ({ location }, { dispatch, getState }) => {
  const missionDocHandle = getAutomergeDocHandles().mission;

  // update lander location
  missionDocHandle.change((m: Mission) => {
    m.landerLocation = location;
    m.updatedAt = getAccurateNow().getTime();
  });

  // get elevation of location
  const thunkElevationRes = await dispatch(
    thunkGetElevation({
      path: [location],
      pathSegmentDistances: [0],
      uuid: "lander",
    })
  );

  if (thunkElevationRes.meta.requestStatus !== "rejected") {
    //upsert lander location and elevation
    const elevation = thunkElevationRes.payload as number;
    //update lander location and elevation
    missionDocHandle.change((m: Mission) => {
      m.landerElevationMeters = elevation;
      m.updatedAt = getAccurateNow().getTime();
    });
  }

  // Loop through all stations and update their walkback traverses to snap to the new lander location
  // This automatically saves, there's no "draft" for these changes
  // Create an array of promises for all station updates
  const stationUpdatePromises = getState().station.stations.map(async (station) => {
    const newPathRes = await dispatch(
      thunkFullUpdateWalkback({
        path: station.walkbackPath,
        stationUuid: station.uuid,
      })
    );

    if (newPathRes.meta.requestStatus === "rejected" || !newPathRes.payload) {
      throw new Error("Error updating lander location in thunkUpdateLanderLocation");
    }

    // Return the dispatch promise but don't await it here
    return dispatch(thunkSaveStation({ stationUuid: station.uuid }));
  });
  await Promise.all(stationUpdatePromises); // Wait for all station updates to complete

  // Loop through evas that have lander as their egress location as lander and update their traverses
  // This automatically saves, there's no "draft" for these changes
  const egressEvas = getState().eva.evas.filter(
    (e) => e.egressLocationUuid === "lander" && e.sequence.length > 0
  );
  const traverseUpdateEgressPromises = egressEvas.map((eva) => {
    return dispatch(
      thunkFullUpdateTraverse({
        traverseUuid: eva.sequence[0].uuid,
        rename: false,
        evaSequence: eva.sequence,
        saveToDb: true,
      })
    );
  });
  await Promise.all(traverseUpdateEgressPromises);

  // Loop through evas that have lander as their ingress location and update their traverses
  // This automatically saves, there's no "draft" for these changes
  const ingressEvas = getState().eva.evas.filter(
    (e) => e.ingressLocationUuid === "lander" && e.sequence.length > 0
  );
  const traverseUpdateIngressPromises = ingressEvas.map((eva) => {
    return dispatch(
      thunkFullUpdateTraverse({
        traverseUuid: eva.sequence[eva.sequence.length - 1].uuid,
        rename: false,
        evaSequence: eva.sequence,
        saveToDb: true,
      })
    );
  });
  await Promise.all(traverseUpdateIngressPromises);
});

export const thunkCreateTemplateFromAction = appCreateAsyncThunk<{ actionUuid: string }, string>(
  "createTemplateFromAction",
  async ({ actionUuid }, { getState }) => {
    const action = getState().action.actions.find((a) => a.uuid === actionUuid);
    if (!action) return "";

    const newActionTemplateUuid = uuidv4();
    const newActionTemplate: ActionTemplate = {
      templateName: `Template of ${action.name}`,
      name: action.name,
      actionDefinition: action.actionDefinition,
      icon: action.icon,
      description: action.description,
      descriptionTask: action.descriptionTask,
      status: action.status,
      type: action.type,
      duration: action.duration,
      stmAction: action.stmAction,
      stmPriorities: action.stmPriorities,
      equipmentItemsUsage: action.equipmentItemsUsage,
      geographicUnitsUsage: action.geographicUnitsUsage,
      crewAssigned: action.crewAssigned,
      mass: action.mass,
      priority: action.priority,
      createdAt: getAccurateNow().getTime(),
      updatedAt: getAccurateNow().getTime(),
    };

    //upsert action template
    const missionDocHandle = getAutomergeDocHandles().mission;
    missionDocHandle.change((m: Mission) => {
      if (newActionTemplate.stmAction) {
        // update template name to noun/verb/adj name
        const nounName =
          m.actionDefinitions?.nouns?.[newActionTemplate.actionDefinition?.nounUuid || ""]?.name;
        const verbName =
          m.actionDefinitions?.verbs?.[newActionTemplate.actionDefinition?.verbUuid || ""]?.name;
        const adjName =
          m.actionDefinitions?.adjectives?.[newActionTemplate.actionDefinition?.adjectiveUuid || ""]
            ?.name;

        newActionTemplate.templateName =
          `Template of ${verbName || "Verb"} of ${nounName || "Noun"} in ${adjName || "Adj"} `.trim();
      }
      m.actionTemplates[newActionTemplateUuid] = newActionTemplate;
      m.updatedAt = getAccurateNow().getTime();
    });
    return newActionTemplateUuid;
  }
);

export const thunkMakeExportString = appCreateAsyncThunk<
  {
    selectEvas: boolean;
    selectMission: boolean;
    selectPois: boolean;
    selectStations: boolean;
    selectActions: boolean;
    selectTraverses: boolean;
    selectRexes: boolean;
  },
  string,
  false
>(
  "makeExportString",
  async (
    {
      selectEvas,
      selectMission,
      selectPois,
      selectStations,
      selectActions,
      selectTraverses,
      selectRexes,
    },
    { getState }
  ) => {
    const missionDocHandle = getAutomergeDocHandles().mission;
    const mission = missionDocHandle.doc();
    const allData: AllDataForExport = {
      mission: mission || ({} as Mission),
      pois: getState().poi.pois,
      stations: getState().station.stations,
      actions: getState().action.actions,
      traverses: getState().traverse.traverses,
      evas: getState().eva.evas,
      rexes: getState().rex.rexes,
      level1s: getState().stm.level1s,
      level2s: getState().stm.level2s,
      level3s: getState().stm.level3s,
    };
    let selectedExportedData = {};

    /**
     * Mission
     */
    if (selectMission) {
      const exportMission = makeExportMission({
        mission: mission,
        missionGrid: globalGrid?.coordinates,
      });
      selectedExportedData = { ...selectedExportedData, exportMission };
    }

    /**
     * Actions
     */
    if (selectActions) {
      const actions: ExportAction[] = makeExportActions({
        actions: getState().action?.actions,
        allData,
        missionGrid: globalGrid?.coordinates,
      });
      selectedExportedData = { ...selectedExportedData, actions };
    }
    /**
     * POIs
     */
    if (selectPois) {
      const pois: ExportPOI[] = makeExportPois({
        pois: getState().poi.pois,
        missionGrid: globalGrid?.coordinates,
        allData,
      });
      selectedExportedData = { ...selectedExportedData, pois };
    }
    /**
     * Stations
     */
    if (selectStations) {
      const stations: ExportStation[] = makeExportStations({
        stations: getState().station.stations,
        missionGrid: globalGrid?.coordinates,
        allData,
      });
      selectedExportedData = { ...selectedExportedData, stations };
    }
    /**
     * Traverses
     */
    if (selectTraverses) {
      const traverses: ExportTraverse[] = makeExportTraverses({
        traverses: getState().traverse?.traverses,
        missionGrid: globalGrid?.coordinates,
        allData,
      });
      selectedExportedData = { ...selectedExportedData, traverses };
    }
    /**
     * EVAs
     */
    if (selectEvas) {
      const evas: ExportEva[] = makeExportEvas({
        evas: getState().eva?.evas,
        missionGrid: globalGrid?.coordinates,
        allData,
      });
      selectedExportedData = { ...selectedExportedData, evas };
    }
    /**
     * REXes
     */
    if (selectRexes) {
      const rexes: ExportRex[] = makeExportRexes({
        rexes: getState().rex?.rexes,
      });
      selectedExportedData = { ...selectedExportedData, rexes };
    }

    // convert object to readable string
    const sortedJson = jsonKeysSort.sort(selectedExportedData);
    const dataStr = JSON.stringify(sortedJson, null, 2);

    return dataStr;
  }
);
