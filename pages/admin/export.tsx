import { convertNodeToHTML, convertStringToNodes } from "components/interface/form/wysiwyg";
import PopulateStore from "components/interface/page/populateStore";
import _ from "lodash";
import { NextPage } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { shallowEqual, useAppSelector } from "utils/useAppSelector";
import { stripHtml } from "string-strip-html";
import { Checkbox } from "components/interface/form/globalFields";
import { isLoggedIn } from "http-client/login";
import { getMissions } from "http-client/mission";
import { decodeEmoji } from "utils/formatting";
const jsonKeysSort = require("json-keys-sort");

interface ExportAction extends Action {
  _itemType?: string;
  descriptionReadable?: string;
  parentPoiName?: string;
  parentStationName?: string;
  stmNames?: string[];
  iconEmojiDecoded?: string;
  equipmentItemsUsageReadable?: EquipmentItemUsageReadable[];
  geographicalUnitsReadable?: string[];
}

interface ExportPOI extends POI {
  _itemType?: string;
  descriptionReadable?: string;
  actionsReadable?: Action[];
  calculatedFields?: PoiCalculatedFields;
  elevationRelative?: number;
  iconEmojiDecoded?: string;
}

type PoiSummaryReadable = {
  name: string;
  description: string;
};

interface ExportStation extends Station {
  _itemType?: string;
  descriptionReadable?: string;
  actionsReadable?: Action[];
  calculatedFields?: StationCalculatedFields;
  elevationRelative?: number;
  iconEmojiDecoded?: string;
  poisAssociatedReadable?: PoiSummaryReadable[];
}

interface ExportStationCalculatedFields extends StationCalculatedFields {
  equipmentItemsReadable?: EquipmentItemUsageReadable[];
}

interface ExportTraverses extends Traverse {
  _itemType?: string;
  descriptionReadable?: string;
  calculatedFields?: TraverseCalculatedFields;
}

interface ExportEva extends Eva {
  _itemType?: string;
  descriptionReadable?: string;
  sequenceReadable?: (Station | Traverse)[]; // stations and traverses in order
  calculatedFields?: ExportEvaCalculatedFields;
}

interface ExportEvaCalculatedFields extends EvaCalculatedFields {
  equipmentItemsReadable?: EquipmentItemUsageReadable[];
}

type EquipmentItemUsageReadable = {
  name: string;
  singleUse: boolean;
  quantityUsed: number;
};

type ExportedData = {
  mission: Mission;
  pois: ExportPOI[];
  stations: ExportStation[];
  actions: ExportAction[];
  traverses: ExportTraverses[];
  evas: ExportEva[];
};

const ExportPage: NextPage = () => {
  const router = useRouter();
  const { missionId } = router.query;
  const intMissionId = missionId ? parseInt(missionId as string) : null;

  const missionStore = useAppSelector((state) => state.mission, shallowEqual);
  const poiStore = useAppSelector((state) => state.poi, shallowEqual);
  const stationStore = useAppSelector((state) => state.station, shallowEqual);
  const actionStore = useAppSelector((state) => state.action, shallowEqual);
  const traverseStore = useAppSelector((state) => state.traverse, shallowEqual);
  const evaStore = useAppSelector((state) => state.eva, shallowEqual);
  const stmStore = useAppSelector((state) => state.stm, shallowEqual);

  const [exportedData, setExportedData] = useState<ExportedData>(null);
  const [selectedOutput, setSelectedOutput] = useState("");

  const [selectEvas, setSelectEvas] = useState(true);
  const [selectMission, setSelectMission] = useState(false);
  const [selectPois, setSelectPois] = useState(false);
  const [selectStations, setSelectStations] = useState(false);
  const [selectActions, setSelectActions] = useState(false);
  const [selectTraverses, setSelectTraverses] = useState(false);

  //on load check login and mission id
  useEffect(() => {
    (async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        const user = response.data.user;
        if (!(user.isAdmin || user.isSuperAdmin)) {
          router.push("/admin"); //Redirect to homepage
        }
      } else {
        router.push("/admin");
      }

      const missions = (await getMissions()).data;
      if (!missions.find((m) => m.id === intMissionId)) router.push("/admin");
    })();
  }, [router, intMissionId]);

  useEffect(() => {
    if (
      !missionStore.mission ||
      poiStore.pois.length === 0 ||
      stationStore.stations.length === 0 ||
      actionStore.actions.length === 0 ||
      traverseStore.traverses.length === 0 ||
      evaStore.evas.length === 0 ||
      stmStore.objectives.length === 0 ||
      stmStore.goals.length === 0 ||
      stmStore.investigations.length === 0
    )
      return;

    const decodeWsywig = (string: string) => {
      // convert wysiwyg to html and strip the html tags
      let newString = stripHtml(
        _.reduce(
          convertStringToNodes(string),
          (htmlString, decendant) => htmlString + convertNodeToHTML(decendant),
          ""
        )
      ).result;
      // remove extra line breaks
      newString = newString.replace(/(\r\n|\n|\r)/gm, "");
      // replace tabs
      newString = newString.replace(/\t/g, " ");
      // replace multiple spaces with single space
      newString = newString.replace(/ +(?= )/g, "");
      return newString;
    };

    const getStmNames = (stmUuidRefs: string[]) => {
      return stmUuidRefs?.map((stmUuidRef) => {
        const stm3Investigation = stmStore.investigations.find((s) => s.uuid === stmUuidRef);
        const stm3Goal = stmStore.goals.find((s) => s.uuid === stm3Investigation?.goalUuid);
        const stm3Objective = stmStore.objectives.find((s) => s.uuid === stm3Goal?.objectiveUuid);
        if (stm3Investigation)
          return `${stm3Objective.numbering}${stm3Goal.numbering}${stm3Investigation.numbering} ${stm3Investigation.name}`;
        return "";
      });
    };

    const makeEquipmentReadable = (
      equipmentItems: EquipmentItemUsage[]
    ): EquipmentItemUsageReadable[] => {
      const equipmentItemsReadable: EquipmentItemUsageReadable[] = [];
      equipmentItems?.forEach((equipmentItem) => {
        const equipmentItemReadable: EquipmentItemUsageReadable = {
          name: missionStore.mission.equipmentItems.find((e) => e.uuid === equipmentItem.uuid)
            ?.name,
          singleUse: missionStore.mission.equipmentItems.find((e) => e.uuid === equipmentItem.uuid)
            ?.singleUse,
          quantityUsed: equipmentItem.quantityUsed,
        };
        equipmentItemsReadable.push(equipmentItemReadable);
      });
      return equipmentItemsReadable;
    };

    /**
     * Actions
     */
    const actions: ExportAction[] = _.cloneDeep(actionStore.actions);
    actions.forEach((action) => {
      action._itemType = "Action";
      // convert descriptions to text
      action.descriptionReadable = decodeWsywig(action.description);
      // add parent station name
      action.parentStationName = stationStore.stations.find(
        (s) => s.uuid === action.stationUuid
      )?.name;
      // add parent poi name
      action.parentPoiName = poiStore.pois.find((p) => p.uuid === action.poiUuid)?.name;
      // convert stmUuidRefs to stmNames
      action.stmNames = getStmNames(action.stmUuidRefs);
      // decode emoji icon
      action.iconEmojiDecoded = decodeEmoji(action.icon);
      // make equipment readable
      action.equipmentItemsUsageReadable = makeEquipmentReadable(action.equipmentItemsUsage);
      // make geographicalUnits readable
      action.geographicalUnitsReadable = action.geographicUnitsUsage?.map(
        (geographicUnitUsageUuid) => {
          return missionStore.mission.geographicUnits.find(
            (g) => g.uuid === geographicUnitUsageUuid
          )?.name;
        }
      );
    });

    /**
     * POIs
     */
    const pois: ExportPOI[] = _.cloneDeep(poiStore.pois);
    pois.forEach((poi) => {
      poi._itemType = "POI";
      // add actions to pois as children in the order listed in actionOrderUuids
      const actionsReadable: Action[] = [];
      poi.actionOrderUuids.forEach((actionUuid) => {
        const action = actions.find((a) => a.uuid === actionUuid);
        if (action) actionsReadable.push(action);
      });
      poi.actionsReadable = actionsReadable;
      // convert descriptions to text
      poi.descriptionReadable = decodeWsywig(poi.description);
      // add calculated fields
      poi.calculatedFields = poiStore.calculatedFields.find((c) => c.uuid === poi.uuid);
      // add elevation relative
      poi.elevationRelative = poi.elevation - missionStore.mission.landerElevationMeters;
      // decode emoji icon
      poi.iconEmojiDecoded = decodeEmoji(poi.icon);
    });

    /**
     * Stations
     */
    const stations: ExportStation[] = _.cloneDeep(stationStore.stations);
    stations.forEach((station) => {
      station._itemType = "Station";
      // add actions to stations as children in the order listed in actionOrderUuids
      const actionsReadable: Action[] = [];
      station.actionOrderUuids.forEach((actionUuid) => {
        const action = actions.find((a) => a.uuid === actionUuid);
        if (action) actionsReadable.push(action);
      });
      station.actionsReadable = actionsReadable;
      // convert descriptions to text
      station.descriptionReadable = decodeWsywig(station.description);
      // add calculated fields
      const calculatedFields: ExportStationCalculatedFields = _.cloneDeep(
        stationStore.calculatedFields.find((c) => c.uuid === station.uuid)
      );
      if (calculatedFields) {
        // make used equipment readable
        calculatedFields.equipmentItemsReadable = makeEquipmentReadable(
          calculatedFields.equipmentItems
        );
        station.calculatedFields = calculatedFields;
      }
      // add elevation relative
      station.elevationRelative = station.elevation - missionStore.mission.landerElevationMeters;
      // decode emoji icon
      station.iconEmojiDecoded = decodeEmoji(station.icon);
      // add pois associated readable
      const poisAssociatedReadable: PoiSummaryReadable[] = [];
      station.poiUuids.forEach((poiUuid) => {
        const poi = pois.find((p) => p.uuid === poiUuid);
        if (poi) {
          poisAssociatedReadable.push({
            name: poi.name,
            description: decodeWsywig(poi.description),
          });
        }
      });
      station.poisAssociatedReadable = poisAssociatedReadable;
    });

    /**
     * Traverses
     */
    const traverses: ExportTraverses[] = _.cloneDeep(traverseStore.traverses);
    traverses.forEach((traverse) => {
      traverse._itemType = "Traverse";
      // convert descriptions to text
      traverse.descriptionReadable = decodeWsywig(traverse.description);
      // add calculated fields
      traverse.calculatedFields = traverseStore.calculatedFields.find(
        (c) => c.uuid === traverse.uuid
      );
    });

    /**
     * EVAs
     */
    const evas: ExportEva[] = _.cloneDeep(evaStore.evas);
    evas.forEach((eva) => {
      eva._itemType = "EVA";
      // convert descriptions to text
      eva.descriptionReadable = decodeWsywig(eva.description);
      // add sequenceReadable
      eva.sequenceReadable = eva.sequence.map((sequenceItem) => {
        if (sequenceItem.type === "station") {
          return stations.find((s) => s.uuid === sequenceItem.uuid);
        } else if (sequenceItem.type === "traverse") {
          return traverses.find((t) => t.uuid === sequenceItem.uuid);
        }
      });
      // add calculated fields
      const calculatedFields: ExportEvaCalculatedFields = _.cloneDeep(
        evaStore.calculatedFields.find((c) => c.uuid === eva.uuid)
      );
      if (calculatedFields) {
        // make used equipment readable
        calculatedFields.equipmentItemsReadable = makeEquipmentReadable(
          calculatedFields.equipmentItems
        );
        eva.calculatedFields = calculatedFields;
      }
    });

    /**
     * Finish
     */
    const exportedData: ExportedData = {
      mission: missionStore.mission,
      pois,
      stations,
      actions,
      traverses,
      evas,
    };

    setExportedData(exportedData);
  }, [missionStore, poiStore, stationStore, actionStore, traverseStore, evaStore, stmStore]);

  const generateOutput = () => {
    let selectedExportedData = {};
    if (selectEvas)
      selectedExportedData = { ...selectedExportedData, evas: { ...exportedData.evas } };
    if (selectMission)
      selectedExportedData = { ...selectedExportedData, mission: { ...exportedData.mission } };
    if (selectPois)
      selectedExportedData = { ...selectedExportedData, pois: { ...exportedData.pois } };
    if (selectStations)
      selectedExportedData = { ...selectedExportedData, stations: { ...exportedData.stations } };
    if (selectActions)
      selectedExportedData = { ...selectedExportedData, actions: { ...exportedData.actions } };
    if (selectTraverses)
      selectedExportedData = { ...selectedExportedData, traverses: { ...exportedData.traverses } };

    // convert object to readble string
    const sortedJson = jsonKeysSort.sort(selectedExportedData);
    const dataStr = JSON.stringify(sortedJson, null, 2);

    return dataStr;
  };

  if (!intMissionId) return <div>No missionId provided</div>;

  return (
    <>
      <div>
        <h1>Export</h1>
        <div style={{ marginBottom: "5px" }}>Mission: {missionStore.mission?.name}</div>
        <div style={{ userSelect: "none" }}>
          <div>Select parts of mission data to export:</div>
          <Checkbox
            label="All EVAs (including stations with associated actions and traverses)"
            checked={selectEvas}
            onChange={() => setSelectEvas(!selectEvas)}
          />

          <Checkbox
            label="All POIs (including associated actions)"
            checked={selectPois}
            onChange={() => setSelectPois(!selectPois)}
            uniqueId="export-pois"
          />
          <Checkbox
            label="All Stations (including associated actions)"
            checked={selectStations}
            onChange={() => setSelectStations(!selectStations)}
            uniqueId="export-stations"
          />
          <Checkbox
            label="All Actions (including associated STMs)"
            checked={selectActions}
            onChange={() => setSelectActions(!selectActions)}
            uniqueId="export-actions"
          />
          <Checkbox
            label="All Traverses"
            checked={selectTraverses}
            onChange={() => setSelectTraverses(!selectTraverses)}
            uniqueId="export-traverses"
          />
          <Checkbox
            label="Mission Details"
            checked={selectMission}
            onChange={() => setSelectMission(!selectMission)}
            uniqueId="export-mission"
          />
          <button
            onClick={() => {
              const output = generateOutput();
              setSelectedOutput(output);
            }}
          >
            Export as JSON to Text Field
          </button>
          <button
            onClick={() => {
              const output = generateOutput();
              setSelectedOutput(output);
              const element = document.createElement("a");
              const file = new Blob([output], { type: "text/json" });
              element.href = URL.createObjectURL(file);
              let filename = `${missionStore.mission?.name}_`;
              if (selectEvas) filename += "evas_";
              if (selectMission) filename += "mission_";
              if (selectPois) filename += "pois_";
              if (selectStations) filename += "stations_";
              if (selectActions) filename += "actions_";
              if (selectTraverses) filename += "traverses_";
              filename += "export.json";
              element.download = filename;
              document.body.appendChild(element); // Required for this to work in FireFox
              element.click();
            }}
          >
            Export as JSON File
          </button>
        </div>
        <div style={{ fontSize: "0.8em" }}>
          <textarea
            style={{ width: "100%", height: "300px" }}
            value={selectedOutput}
            readOnly={true}
          />
        </div>
      </div>
      <PopulateStore missionId={intMissionId} hasPermissions={true} />
    </>
  );
};

export default ExportPage;
