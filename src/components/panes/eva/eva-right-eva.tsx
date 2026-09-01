import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "./eva.module.css";
import type { FunctionComponent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import {
  faCircleInfo,
  faTrashAlt,
  faPersonDigging,
  faTriangleExclamation,
  faCheck,
  faFileExport,
  faCrosshairs,
  faPersonWalkingArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "components/interface/form/globalFields";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";

import Info_Panel from "./eva-right-eva-info";
import Actions_Panel from "./eva-right-eva-actions";
import Report_Panel from "../report";
import Export_Panel from "./eva-right-eva-export";
import REX_Positions_panel from "../rex/rex-right-rex-posTypes";
import REX_Info_panel from "../rex/rex-right-rex-info";

import { setSelectedEvaRightNavItem } from "store/eva";
import { getAlertColor } from "utils/component-helpers";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDocDeleteEva } from "store/thunk/thunkEva";
import { validators } from "components/interface/form/formValidators";
import { RightTabs } from "components/interface/side-controls";
import {
  getCalcFieldsForEva,
  getCalcFieldsForStation,
  getCalcFieldsForTraverse,
} from "store/processing/calculatedFields";
import isNull from "lodash/isNull";
import { thunkDocDeleteRex } from "store/thunk/thunkRex";
import { LoadingOverlay } from "components/interface/_global-elements";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdateEvaByField } from "operations/apply/apply-eva";
import { applyUpdateRexByField } from "operations/apply/apply-rex";

const EvaRightEva: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const partialMission = useMissionDocSelector(
    (mission) => ({ walkbackRate: mission.walkbackRate, traverseRate: mission.traverseRate }),
    deepEqual
  );

  const selectedRightNavItem = useAppSelector(
    (state) => state.eva.selectedEvaRightNavItem,
    refEqual
  );
  const isInEditMode = useAppSelector((state) => state.mission.isInEditMode, refEqual);
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);

  const docMaps = useMissionDocSelector(
    (mission) => ({
      evas: mission.evas,
      rexes: mission.rexes,
      stations: mission.stations,
      actions: mission.actions,
      traverses: mission.traverses,
    }),
    shallowEqual
  );

  const selectedEva = useMemo(
    () => (selectedEvaUuid ? docMaps?.evas?.[selectedEvaUuid] : undefined),
    [docMaps, selectedEvaUuid]
  );
  const selectedRex = useMemo(
    () => (selectedRexUuid ? docMaps?.rexes?.[selectedRexUuid] : undefined),
    [docMaps, selectedRexUuid]
  );

  const isRexEva = useMemo(() => {
    if (!docMaps?.rexes || !selectedEvaUuid) return false;
    return Object.values(docMaps.rexes).some((rex) => rex.evaUuid === selectedEvaUuid);
  }, [docMaps, selectedEvaUuid]);

  const isAsPlannedEvaWithRexes = useMemo(() => {
    if (isRexEva || !selectedEva || !docMaps?.evas) return false;
    return Object.values(docMaps.evas).filter((e) => e.refUuid === selectedEva.refUuid).length > 1;
  }, [isRexEva, selectedEva, docMaps]);

  const selectedAsPlannedEvaName = useMemo(() => {
    if (!selectedRex || !docMaps?.evas) return "";
    const rexEva = docMaps.evas[selectedRex.evaUuid];
    if (!rexEva) return "";
    const allRexEvaUuids = docMaps?.rexes ? Object.values(docMaps.rexes).map((r) => r.evaUuid) : [];
    const asPlannedEva = Object.values(docMaps.evas).find(
      (e) => e.refUuid === rexEva.refUuid && !allRexEvaUuids.includes(e.uuid)
    );
    return asPlannedEva?.name ?? "";
  }, [selectedRex, docMaps]);

  const otherEvaNames = useMemo(() => {
    if (!docMaps?.evas || !docMaps?.rexes || !selectedEva) return [];
    const rexEvaUuids = Object.values(docMaps.rexes).map((r) => r.evaUuid);
    return Object.values(docMaps.evas)
      .filter((e) => !rexEvaUuids.includes(e.uuid) && e.refUuid !== selectedEva.refUuid)
      .map((e) => e.name);
  }, [docMaps, selectedEva]);

  const otherRexNames = useMemo(() => {
    if (!docMaps?.rexes || !docMaps?.evas || !selectedRex) return [];
    const rexEva = docMaps.evas?.[selectedRex.evaUuid];
    if (!rexEva) return [];
    return Object.values(docMaps.rexes)
      .filter((r) => {
        const rEva = docMaps.evas?.[r.evaUuid];
        return rEva?.refUuid === rexEva.refUuid && r.uuid !== selectedRexUuid;
      })
      .map((r) => r.name);
  }, [docMaps, selectedRex, selectedRexUuid]);

  const calculatedFields = useMemo(() => {
    if (!docMaps || !selectedEva) return undefined;
    const seqStationUuids = new Set(
      selectedEva.sequence.filter((s) => s.type === "station").map((s) => s.uuid)
    );
    const seqTraverseUuids = new Set(
      selectedEva.sequence.filter((s) => s.type === "traverse").map((s) => s.uuid)
    );
    return getCalcFieldsForEva({
      eva: selectedEva,
      evaStations: Object.values(docMaps.stations ?? {}).filter((s) => seqStationUuids.has(s.uuid)),
      missionWalkbackRate: partialMission.walkbackRate,
      missionTraverseRate: partialMission.traverseRate,
      evaActions: Object.values(docMaps.actions ?? {}).filter(
        (a) => seqStationUuids.has(a.stationUuid) || seqTraverseUuids.has(a.traverseUuid)
      ),
      evaTraverses: Object.values(docMaps.traverses ?? {}).filter((t) =>
        seqTraverseUuids.has(t.uuid)
      ),
    });
  }, [selectedEva, docMaps, partialMission.walkbackRate, partialMission.traverseRate]);

  const traverseCalculatedFieldsInSequence = useMemo(() => {
    if (!selectedEva || !docMaps) return [];
    const traverseUuidsInThisEva: string[] = [];
    selectedEva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "traverse") {
        traverseUuidsInThisEva.push(sequenceItem.uuid);
      }
    });
    const traverseCalculatedFields: TraverseCalculatedFields[] = [];
    for (const traverseUuid of traverseUuidsInThisEva) {
      const traverse = docMaps.traverses?.[traverseUuid];
      const traverseActions = Object.values(docMaps.actions ?? {}).filter(
        (a) => a.traverseUuid === traverse?.uuid && a.enabled
      );
      traverseCalculatedFields.push(
        getCalcFieldsForTraverse({
          traverse,
          missionTraverseRate: partialMission.traverseRate,
          evaTraverseRate: selectedEva?.traverseRate,
          traverseActions,
        })
      );
    }
    return traverseCalculatedFields;
  }, [selectedEva, docMaps, partialMission.traverseRate]);

  const stationCalculatedFieldsInSequence = useMemo(() => {
    if (!selectedEva || !docMaps) return [];
    const stationUuidsInThisEva: string[] = [];
    selectedEva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "station") {
        stationUuidsInThisEva.push(sequenceItem.uuid);
      }
    });
    const stationCalculatedFields: StationCalculatedFields[] = [];
    for (const stationUuid of stationUuidsInThisEva) {
      const station = docMaps.stations?.[stationUuid];
      const stationActions = Object.values(docMaps.actions ?? {}).filter(
        (a) => a.stationUuid === stationUuid && a.enabled
      );
      stationCalculatedFields.push(
        getCalcFieldsForStation({
          station,
          missionWalkbackRate: partialMission.walkbackRate,
          stationActions,
        })
      );
    }
    return stationCalculatedFields;
  }, [selectedEva, docMaps, partialMission.walkbackRate]);

  const selectedRexIsExecuting = useMemo(() => selectedRex?.isRunning ?? false, [selectedRex]);

  const evaReportSequenceItems = useMemo<EvaReportSequenceItem[]>(() => {
    if (!selectedEva || !docMaps) return [];
    const items: EvaReportSequenceItem[] = [];
    for (const sequenceItem of selectedEva.sequence) {
      const station = docMaps.stations?.[sequenceItem.uuid];
      const traverse = docMaps.traverses?.[sequenceItem.uuid];
      if (traverse) {
        const traverseCalculatedFields = traverseCalculatedFieldsInSequence.find(
          (tcf) => tcf.uuid === sequenceItem.uuid
        );
        items.push({
          type: "traverse",
          uuid: traverse.uuid,
          name: traverse.name,
          reportItems: traverseCalculatedFields?.reportItems,
        });
      } else if (station) {
        const stationCalculatedFields = stationCalculatedFieldsInSequence.find(
          (fields) => fields?.uuid === sequenceItem.uuid
        );
        items.push({
          type: "station",
          uuid: station.uuid,
          name: station.name,
          icon: station.icon,
          reportItems: stationCalculatedFields?.reportItems,
        });
      }
    }
    return items;
  }, [selectedEva, docMaps, traverseCalculatedFieldsInSequence, stationCalculatedFieldsInSequence]);

  const [reportsTabIconColor, setReportsTabIconColor] = useState<string>("var(--eva)");
  const [reportsTabIcon, setReportsTabIcon] = useState<IconDefinition>(faTriangleExclamation);
  const [showOverlay, setShowOverlay] = useState<{ showOverlay: boolean; message?: string }>({
    showOverlay: false,
    message: "",
  });

  const evaPanelTypes: PanelTypes = {
    info_panel: {
      title: "EVA Information",
      panel: Info_Panel,
      panelProps: { editMode: isInEditMode },
      selectedColor: "white",
      icon: faCircleInfo,
    },
    actions_panel: {
      title: "EVA Actions",
      panel: Actions_Panel,
      selectedColor: "white",
      icon: faPersonDigging,
    },
    report_panel: {
      title: "Reports",
      panel: Report_Panel,
      panelProps: {
        reportItems: calculatedFields?.reportItems,
        evaReportItems: evaReportSequenceItems,
        reportTitle: `EVA Report (${isRexEva ? selectedRex?.name : "As Planned"}) `,
      },
      selectedColor: !isNull(reportsTabIconColor) ? reportsTabIconColor : "var(--eva)",
      unselectedColor: reportsTabIconColor,
      icon: reportsTabIcon,
    },
    export_panel: {
      title: "Export Data",
      panel: Export_Panel,
      selectedColor: "white",
      icon: faFileExport,
    },
  };
  const rexPanelTypes: PanelTypes = {
    rex_info_panel: {
      title: "REX Information",
      panel: REX_Info_panel,
      panelProps: { editMode: isInEditMode },
      selectedColor: "white",
      icon: faPersonWalkingArrowRight,
    },
    rex_positions_panel: {
      title: "REX Position Marker Tracking",
      panel: REX_Positions_panel,
      panelProps: { editMode: isInEditMode },
      selectedColor: "white",
      icon: faCrosshairs,
    },
  };
  const evaAndRexPanelTypes: PanelTypes = { ...evaPanelTypes, ...rexPanelTypes };

  useEffect(() => {
    setReportsTabIconColor(getAlertColor(calculatedFields?.reportItems, evaReportSequenceItems));
  }, [calculatedFields, evaReportSequenceItems]);

  const rightNavItem = useMemo(() => {
    if (
      !selectedRightNavItem ||
      (!isRexEva && selectedRightNavItem.toLowerCase().startsWith("rex"))
    ) {
      return "info_panel";
    }
    return selectedRightNavItem;
  }, [selectedRightNavItem, isRexEva]);

  // Set reports tab icon
  useEffect(() => {
    if (!evaReportSequenceItems || !calculatedFields) return;
    let showCheckmark = true;
    if (calculatedFields?.reportItems.length > 0) {
      showCheckmark = false;
    } else {
      evaReportSequenceItems.forEach((evaReportSequenceItem) => {
        if (evaReportSequenceItem.reportItems.length > 0) {
          showCheckmark = false;
        }
      });
    }
    setReportsTabIcon(showCheckmark ? faCheck : faTriangleExclamation);
  }, [calculatedFields, evaReportSequenceItems]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ActiveComponent: FunctionComponent<any> = evaAndRexPanelTypes[rightNavItem]?.panel;

  if (!selectedEva) return null;

  return (
    <div className={selectedRexIsExecuting ? evaStyles.rightPaneExecuting : evaStyles.rightPane}>
      <div className={paneStyles.rightTopTitle}>
        <div className={evaStyles.rightTopTitleText}>
          <ValidatedInputField
            value={selectedRex ? selectedAsPlannedEvaName : selectedEva.name}
            editMode={selectedRex ? false : isInEditMode}
            fieldProps={{
              name: "name",
              ariaLabel: "EVA Title",
              validators: [
                validators.required,
                validators.maxLength(255),
                validators.mustBeUnique(otherEvaNames),
              ],
            }}
            styleContainer={{ padding: 0 }}
            displayStyle={{ fontSize: "1.1em", color: "var(--eva)" }}
            onSubmit={(val) => {
              withMissionChange((m) =>
                applyUpdateEvaByField(m, {
                  evaUuid: selectedEvaUuid,
                  fieldName: "name",
                  value: val || "",
                })
              );
            }}
          />
          {isRexEva && selectedRex && (
            <ValidatedInputField
              value={selectedRex.name}
              editMode={isInEditMode}
              fieldProps={{
                name: "name",
                ariaLabel: "REX Title",
                validators: [
                  validators.required,
                  validators.maxLength(255),
                  validators.mustBeUnique(otherRexNames),
                ],
              }}
              styleContainer={{ padding: 0 }}
              displayStyle={{ fontSize: "1.1em", color: "var(--rex)" }}
              onSubmit={(val) => {
                withMissionChange((m) =>
                  applyUpdateRexByField(m, {
                    rexUuid: selectedRex.uuid,
                    fieldName: "name",
                    value: val || "",
                  })
                );
              }}
            />
          )}
        </div>
      </div>
      <div className={paneStyles.rightSubTray}>
        <RightTabs
          selectedRightNavItem={rightNavItem}
          panelTypes={isRexEva ? evaAndRexPanelTypes : evaPanelTypes}
          dispatchFunction={setSelectedEvaRightNavItem}
        />
        <div className={paneStyles.saveCancelContainer}>
          {isInEditMode && (
            <Button
              ariaLabel="deleteEva"
              icon={faTrashAlt}
              onClick={async () => {
                if (isRexEva) {
                  // This is a rex EVA
                  const confirmMsg =
                    "Are you sure you want to delete this Real-time Execution (REX)?";
                  if (!window.confirm(confirmMsg)) return;
                  setShowOverlay({ showOverlay: true, message: "Deleting EVA Execution..." });
                  try {
                    await dispatch(thunkDocDeleteRex({ rexUuid: selectedRex?.uuid }));
                  } finally {
                    setShowOverlay({ showOverlay: false });
                  }
                } else {
                  // This is an as-planned EVA
                  let confirmMsg = "Are you sure you want to delete this EVA?";
                  // Check if this as-planned EVA has rexes
                  if (isAsPlannedEvaWithRexes) {
                    confirmMsg +=
                      "\nWARNING: This EVA has REXes. Deleting this EVA will delete ALL REXes in this EVA.";
                  }
                  if (!window.confirm(confirmMsg)) return;
                  setShowOverlay({ showOverlay: true, message: "Deleting EVA..." });
                  try {
                    await dispatch(thunkDocDeleteEva({ evaUuid: selectedEvaUuid, forRex: false }));
                  } finally {
                    setShowOverlay({ showOverlay: false });
                  }
                }
              }}
              toolTip={`Delete EVA ${isRexEva ? " Execution" : ""}`}
              style={{ width: "30px", fontSize: "0.9em", paddingLeft: "9px" }}
            />
          )}
        </div>
      </div>
      {evaAndRexPanelTypes[rightNavItem] && (
        <ActiveComponent {...evaAndRexPanelTypes[rightNavItem]?.panelProps} />
      )}

      {showOverlay.showOverlay && <LoadingOverlay message={showOverlay.message} />}
    </div>
  );
};

export default EvaRightEva;
