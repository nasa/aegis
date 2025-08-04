import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "./eva.module.css";
import { FunctionComponent, useEffect, useMemo, useState } from "react";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import {
  faCircleInfo,
  faBan,
  faFloppyDisk,
  faTrashAlt,
  faEdit,
  faPersonDigging,
  faTriangleExclamation,
  faCheck,
  IconDefinition,
  faFileExport,
  faCrosshairs,
  faPersonWalkingArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { Button, InLineEditInput } from "components/interface/form/globalFields";

import Info_Panel from "./eva-right-eva-info";
import Actions_Panel from "./eva-right-eva-actions";
import Report_Panel from "../report";
import Export_Panel from "./eva-right-eva-export";
import REX_Positions_panel from "../rex/rex-right-rex-posTypes";
import REX_Info_panel from "../rex/rex-right-rex-info";

import { setEvaEditMode, setSelectedEvaRightNavItem } from "store/eva";
import { getAlertColor, isModified } from "utils/component-helpers";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  thunkDeleteEva,
  thunkCancelEva,
  thunkGetStationOrTraverse,
  thunkSaveEva,
  thunkUpdateEvaName,
} from "store/thunk/thunkEva";
import { validators } from "components/interface/form/formValidators";
import { RightTabs } from "components/interface/side-controls";
import {
  getCalculatedFieldsByEva,
  getCalculatedFieldsByStation,
  getCalculatedFieldsByTraverse,
} from "store/processing/calculatedFields";
import isNull from "lodash/isNull";
import { upsertRexByField } from "store/rex";
import { thunkCancelRex, thunkDeleteRex, thunkSaveRex } from "store/thunk/thunkRex";
import { LoadingOverlay } from "components/interface/_global-elements";

const EvaRightEva: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.eva.selectedEvaRightNavItem,
    refEqual
  );
  const evasEditing = useAppSelector((state) => state.eva.evasEditing, shallowEqual);
  const isRexEva = useAppSelector((state) => {
    const allRexEvas = state.rex.rexes.map((rex) => rex.evaUuid);
    return allRexEvas.includes(state.eva.selectedEvaUuid);
  }, refEqual);
  // is it deleting the as-planned eva when we've selected a rex in the right panel?
  const isAsPlannedEvaWithRexes = useAppSelector((state) => {
    // check if as-planned
    if (isRexEva) return false; // this is a rex eva
    // ok this is an as-planned eva, check if it has rexes
    const evaRefUuid = state.eva.evas.find(
      (eva) => eva.uuid === state.eva.selectedEvaUuid
    )?.refUuid;
    const numMatchingRefUuids = state.eva.evas.filter((e) => e.refUuid === evaRefUuid).length;
    return numMatchingRefUuids > 1;
  }, refEqual);

  // get EVA and REX objects
  const partialSelectedEva = useAppSelector((state) => {
    const eva = state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid);
    if (eva) {
      return {
        uuid: eva.uuid,
        name: eva.name,
        createdAt: eva.createdAt,
        updatedAt: eva.updatedAt,
        sequence: eva.sequence,
      };
    }
  }, deepEqual);
  const partialSelectedEvaFromDb = useAppSelector((state) => {
    const eva = state.eva.evasFromDb.find((eva) => eva.uuid === state.eva.selectedEvaUuid);
    if (eva) {
      return {
        uuid: eva.uuid,
        name: eva.name,
        createdAt: eva.createdAt,
        updatedAt: eva.updatedAt,
        sequence: eva.sequence,
      };
    }
  }, deepEqual);
  const partialSelectedRex = useAppSelector((state) => {
    const rex = state.rex.rexes.find((rex) => rex.uuid === state.rex.selectedRexUuid);
    if (rex) {
      return {
        uuid: rex.uuid,
        name: rex.name,
        updatedAt: rex.updatedAt,
        createdAt: rex.createdAt,
      };
    }
  }, deepEqual);
  const partialSelectedRexFromDb = useAppSelector((state) => {
    const rexFromDb = state.rex.rexesFromDb.find((rex) => rex.uuid === state.rex.selectedRexUuid);
    if (rexFromDb) {
      return {
        uuid: rexFromDb.uuid,
        name: rexFromDb.name,
        updatedAt: rexFromDb.updatedAt,
        createdAt: rexFromDb.createdAt,
      };
    }
  }, deepEqual);
  const calculatedFields = useAppSelector((state) => {
    const eva = state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid);
    return getCalculatedFieldsByEva({
      eva,
      evaStations: state.station.stations,
      missionWalkbackRate: state.mission.mission.walkbackRate,
      missionTraverseRate: state.mission.mission.traverseRate,
      evaActions: state.action.actions,
      evaTraverses: state.traverse.traverses,
    });
  }, deepEqual);
  const traverseCalculatedFieldsInSequence = useAppSelector((state) => {
    const eva = state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid);
    if (!eva) return [];
    const traverseUuidsInThisEva: string[] = [];
    eva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "traverse") {
        traverseUuidsInThisEva.push(sequenceItem.uuid);
      }
    });
    const traverseCalculatedFields: TraverseCalculatedFields[] = [];
    for (const traverseUuid of traverseUuidsInThisEva) {
      const traverse = state.traverse.traverses.find((t) => t.uuid === traverseUuid);
      const traverseEva = state.eva.evas.find((eva) =>
        eva.sequence.some((seqItem) => seqItem.uuid === traverse?.uuid)
      );
      const traverseActions = state.action.actions.filter(
        (a) => a.traverseUuid === traverse?.uuid && a.enabled
      );
      traverseCalculatedFields.push(
        getCalculatedFieldsByTraverse({
          traverse,
          missionTraverseRate: state.mission.mission.traverseRate,
          traverseEva,
          traverseActions,
        })
      );
    }
    return traverseCalculatedFields;
  }, deepEqual);

  const stationCalculatedFieldsInSequence = useAppSelector((state) => {
    const eva = state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid);
    if (!eva) return [];
    const stationUuidsInThisEva: string[] = [];
    eva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "station") {
        stationUuidsInThisEva.push(sequenceItem.uuid);
      }
    });
    const stationCalculatedFields: StationCalculatedFields[] = [];
    for (const stationUuid of stationUuidsInThisEva) {
      const station = state.station.stations.find((s) => s.uuid === stationUuid);
      const stationActions = state.action.actions.filter(
        (a) => a.stationUuid === stationUuid && a.enabled
      );
      stationCalculatedFields.push(
        getCalculatedFieldsByStation({
          station,
          missionWalkbackRate: state.mission.mission.walkbackRate,
          stationActions,
        })
      );
    }
    return stationCalculatedFields;
  }, deepEqual);

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const otherEvaNames = useAppSelector((state) => {
    const rexEvaUuids = state.rex.rexes.map((r) => r.evaUuid);
    const thisRefUuid = state.eva.evas.find(
      (eva) => eva.uuid === state.eva.selectedEvaUuid
    )?.refUuid;
    return state.eva.evas
      .filter((e) => !rexEvaUuids.includes(e.uuid))
      .flatMap((eva) => {
        if (eva.refUuid !== thisRefUuid) {
          return eva.name;
        }
      });
  }, deepEqual);
  const otherRexNames = useAppSelector((state) => {
    const rexEvaUuid = state.rex.rexes.find((r) => r.uuid !== state.rex.selectedRexUuid)?.evaUuid;
    const evaRefUuid = state.eva.evas.find((eva) => eva.uuid === rexEvaUuid)?.refUuid;
    const otherEvaUuids = state.eva.evas
      .filter((eva) => eva.refUuid === evaRefUuid)
      ?.map((eva) => eva.uuid);
    return state.rex.rexes
      .filter((r) => otherEvaUuids.includes(r.evaUuid) && r.uuid !== state.rex.selectedRexUuid)
      ?.map((r) => r.name);
  }, deepEqual);

  const [evaReportSequenceItems, setEvaReportSequenceItems] = useState<EvaReportSequenceItem[]>([]);

  // determine if this EVA has been modified by looking at EVA, traverse, and REX data
  const evaModified = isModified([partialSelectedEva], [partialSelectedEvaFromDb]);
  const rexModified = isModified([partialSelectedRex], [partialSelectedRexFromDb]);
  const partialTraverseForModified = useAppSelector((state) => {
    const evaTraverseUuids = state.eva.evas
      .find((eva) => eva.uuid === state.eva.selectedEvaUuid)
      ?.sequence.filter((item) => item.type === "traverse")
      .map((item) => item.uuid);
    return state.traverse.traverses
      .filter((t) => evaTraverseUuids.includes(t.uuid))
      .map((t) => {
        return { uuid: t.uuid, updatedAt: t.updatedAt };
      });
  }, deepEqual);
  const partialTraverseForModifiedFromDb = useAppSelector((state) => {
    const evaTraverseUuids = state.eva.evasFromDb
      .find((eva) => eva.uuid === state.eva.selectedEvaUuid)
      ?.sequence.filter((item) => item.type === "traverse")
      .map((item) => item.uuid);
    return state.traverse.traversesFromDb
      .filter((t) => evaTraverseUuids?.includes(t.uuid))
      .map((t) => {
        return { uuid: t.uuid, updatedAt: t.updatedAt };
      });
  }, deepEqual);
  const traversesModified = isModified(
    partialTraverseForModified,
    partialTraverseForModifiedFromDb
  );
  const modified = evaModified || traversesModified || rexModified;

  const selectedRexIsExecuting = useAppSelector((state) => {
    const selectedRex = state.rex.rexesFromDb.find((r) => r.uuid === state.rex.selectedRexUuid);
    return selectedRex?.isRunning;
  }, refEqual);

  // generate evaReportSequenceItems from the eva sequence
  useEffect(() => {
    const generateEvaReportSequenceItemsAsync = async () => {
      const evaReportSequenceItems: EvaReportSequenceItem[] = [];
      if (partialSelectedEva) {
        for (const sequenceItem of partialSelectedEva.sequence) {
          // fix me todo make this better. this thunk gets called a lot. does the whole report shouldn't need to be generated here
          // we just need it to determine the icon color.
          const seqItemRes = await dispatch(thunkGetStationOrTraverse({ uuid: sequenceItem.uuid }));
          if (!seqItemRes.payload) continue;

          if (seqItemRes.payload.type === "traverse") {
            const traverse = seqItemRes.payload.item as Traverse;
            const traverseCalculatedFields = traverseCalculatedFieldsInSequence.find(
              (traverseCalculatedFields) => traverseCalculatedFields.uuid === sequenceItem.uuid
            );
            if (traverse) {
              evaReportSequenceItems.push({
                type: "traverse",
                uuid: traverse.uuid,
                name: traverse.name,
                reportItems: traverseCalculatedFields?.reportItems,
              });
            }
          } else if (seqItemRes.payload.type === "station") {
            const station = seqItemRes.payload.item as Station;
            const stationCalculatedFields = stationCalculatedFieldsInSequence.find(
              (fields) => fields?.uuid === sequenceItem.uuid
            );
            if (station) {
              evaReportSequenceItems.push({
                type: "station",
                uuid: station.uuid,
                name: station.name,
                icon: station.icon,
                reportItems: stationCalculatedFields?.reportItems,
              });
            }
          }
        }
      }
      setEvaReportSequenceItems(evaReportSequenceItems);
    };
    generateEvaReportSequenceItemsAsync();
  }, [
    partialSelectedEva,
    traverseCalculatedFieldsInSequence,
    stationCalculatedFieldsInSequence,
    dispatch,
  ]);

  const [reportsTabIconColor, setReportsTabIconColor] = useState<string>("var(--eva)");
  const [reportsTabIcon, setReportsTabIcon] = useState<IconDefinition>(faTriangleExclamation);
  const [isDeletingEva, setIsDeletingEva] = useState({ isDeleting: false, isRexEva: false }); // for loading overlay

  const evaPanelTypes: PanelTypes = {
    info_panel: {
      title: "EVA Information",
      panel: Info_Panel,
      panelProps: {
        editMode: evasEditing.includes(partialSelectedEva.uuid),
      },
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
        reportTitle: `EVA Report (${isRexEva ? partialSelectedRex?.name : "As Planned"}) `,
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
      panelProps: {
        editMode: evasEditing.includes(partialSelectedEva.uuid),
      },
      selectedColor: "white",
      icon: faPersonWalkingArrowRight,
    },
    rex_positions_panel: {
      title: "REX Position Marker Tracking",
      panel: REX_Positions_panel,
      panelProps: {
        editMode: evasEditing.includes(partialSelectedEva.uuid),
      },
      selectedColor: "white",
      icon: faCrosshairs,
    },
  };
  const evaAndRexPanelTypes: PanelTypes = {
    ...evaPanelTypes,
    ...rexPanelTypes,
  };

  // set reports tab icon color
  useEffect(() => {
    setReportsTabIconColor(getAlertColor(calculatedFields?.reportItems, evaReportSequenceItems));
  }, [calculatedFields, evaReportSequenceItems]);

  // set what right nav item to show.
  const rightNavItem = useMemo(() => {
    if (
      !selectedRightNavItem ||
      (!isRexEva && selectedRightNavItem.toLowerCase().startsWith("rex"))
    ) {
      return "info_panel";
    } else {
      // pass through the selectedRightNavItem if it is valid
      return selectedRightNavItem;
    }
  }, [selectedRightNavItem, isRexEva]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ActiveComponent: FunctionComponent<any> = evaAndRexPanelTypes[rightNavItem]?.panel;

  // set reports tab icon
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

  return (
    partialSelectedEva && (
      <div className={selectedRexIsExecuting ? evaStyles.rightPaneExecuting : evaStyles.rightPane}>
        <div className={paneStyles.rightTopTitle}>
          <div className={evaStyles.rightTopTitleText}>
            <InLineEditInput
              value={partialSelectedEva.name}
              editing={evasEditing.includes(partialSelectedEva.uuid)}
              fieldProps={{
                name: "name",
                ariaLabel: "EVA Title",
                style: {
                  width: "100%",
                  color: "var(--eva)",
                  fontSize: "1em",
                },
                validators: [
                  validators.required,
                  validators.maxLength(255),
                  validators.mustBeUnique(otherEvaNames),
                ],
              }}
              styleValue={{ padding: 0, height: "auto", color: "var(--eva)" }}
              styleContainer={{ paddingLeft: 0 }}
              onSubmit={(val) => {
                dispatch(thunkUpdateEvaName({ evaUuid: partialSelectedEva.uuid, newName: val }));
              }}
              key={`${partialSelectedEva.uuid}-name`}
              toFocus={partialSelectedEva.createdAt === partialSelectedEva.updatedAt}
            />
            {isRexEva && (
              <>
                <InLineEditInput
                  value={partialSelectedRex?.name}
                  editing={evasEditing.includes(partialSelectedEva.uuid)}
                  fieldProps={{
                    name: "name",
                    ariaLabel: "REX Title",
                    style: {
                      width: "100%",
                      color: "var(--rex)",
                      fontSize: "1em",
                    },
                    validators: [
                      validators.required,
                      validators.maxLength(255),
                      validators.mustBeUnique(otherRexNames),
                    ],
                  }}
                  styleValue={{ padding: 0, height: "auto", color: "var(--rex)" }}
                  styleContainer={{ paddingLeft: 0 }}
                  onSubmit={(val) => {
                    dispatch(upsertRexByField(partialSelectedRex?.uuid, "name", val));
                  }}
                  key={`${partialSelectedRex?.uuid}-name`}
                  toFocus={partialSelectedRex?.createdAt === partialSelectedRex?.updatedAt}
                />
              </>
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
            {evasEditing.includes(partialSelectedEva.uuid) && (
              <Button
                ariaLabel="deleteEva"
                icon={faTrashAlt}
                onClick={async () => {
                  if (isRexEva) {
                    // this is a rex EVA
                    const confirmMsg = "Are you sure you want to delete this EVA execution?";
                    if (!window.confirm(confirmMsg)) return;
                    setIsDeletingEva({ isDeleting: true, isRexEva: true });
                    try {
                      await dispatch(thunkDeleteRex({ rexUuid: partialSelectedRex?.uuid }));
                    } finally {
                      setIsDeletingEva({ isDeleting: false, isRexEva: true });
                    }
                  } else {
                    // this is an as-planned EVA
                    let confirmMsg = "Are you sure you want to delete this EVA?";
                    // check if this as-planned EVA has rexes
                    if (isAsPlannedEvaWithRexes) {
                      confirmMsg +=
                        "\nWARNING: This EVA has rexes. Deleting this EVA will delete ALL rexes in this EVA.";
                    }
                    if (!window.confirm(confirmMsg)) return;
                    setIsDeletingEva({ isDeleting: true, isRexEva: false });
                    try {
                      await dispatch(
                        thunkDeleteEva({ evaUuid: partialSelectedEva.uuid, forRex: false })
                      );
                    } finally {
                      setIsDeletingEva({ isDeleting: false, isRexEva: false });
                    }
                  }
                }}
                toolTip={`Delete EVA ${isRexEva ? " Execution" : ""}`}
                style={{ width: "30px", fontSize: "0.9em", paddingLeft: "9px" }}
              />
            )}
            {!evasEditing.includes(partialSelectedEva.uuid) && editPerms && (
              <Button
                ariaLabel="editEva"
                icon={faEdit}
                onClick={() => {
                  dispatch(setEvaEditMode({ evaUuid: partialSelectedEva.uuid, editMode: true }));
                }}
                label="Edit"
                toolTip={`Edit EVA ${isRexEva ? " Execution" : ""}`}
                style={{ width: "60px", fontSize: "0.9em" }}
                labelStyle={{ marginTop: "2px" }}
              />
            )}

            {evasEditing.includes(partialSelectedEva.uuid) && (
              <>
                <Button
                  ariaLabel="saveEva"
                  onClick={() => {
                    if (modified) {
                      dispatch(thunkSaveEva({ evaUuid: partialSelectedEva.uuid }));
                      if (isRexEva) dispatch(thunkSaveRex({ rexUuid: partialSelectedRex?.uuid }));
                    }
                  }}
                  icon={faFloppyDisk}
                  toolTip={`Save EVA ${isRexEva ? " Execution" : ""}${modified ? "" : " (nothing to save)"}`}
                  enabled={modified}
                  style={{
                    width: "30px",
                    backgroundColor: modified ? "var(--alert)" : "var(--alert-disabled)",
                    color: modified ? "white" : "var(--grey4)",
                    fontSize: "0.9em",
                    paddingLeft: "9px",
                  }}
                />
                <Button
                  ariaLabel="cancelEva"
                  onClick={() => {
                    dispatch(thunkCancelEva({ evaUuid: partialSelectedEva.uuid }));
                    if (isRexEva) dispatch(thunkCancelRex({ rexUuid: partialSelectedRex?.uuid }));
                  }}
                  icon={faBan}
                  toolTip="Cancel Edit"
                  style={{ width: "30px", fontSize: "0.9em", paddingLeft: "8px" }}
                />
              </>
            )}
          </div>
        </div>
        {evaAndRexPanelTypes[rightNavItem] && (
          <ActiveComponent {...evaAndRexPanelTypes[rightNavItem]?.panelProps} />
        )}

        {isDeletingEva.isDeleting && (
          <LoadingOverlay
            message={`Deleting EVA${isDeletingEva.isRexEva ? " Execution" : ""}...`}
          />
        )}
      </div>
    )
  );
};

export default EvaRightEva;
