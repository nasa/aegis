import paneStyles from "../global-pane-styles.module.css";
import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
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
} from "@fortawesome/free-solid-svg-icons";
import { Button, InLineEditInput } from "components/interface/form/globalFields";

import Info_Panel from "./eva-right-eva-info";
import Actions_Panel from "./eva-right-eva-actions";
import Report_Panel from "../report";
import { setEvaEditMode, setSelectedEvaRightNavItem, upsertEvaByField } from "store/eva";
import { getAlertColor, isModified } from "utils/component-helpers";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  thunkDeleteEva,
  thunkEvaCancel,
  thunkGetStationOrTraverse,
  thunkSaveEva,
} from "store/thunk/thunkEva";
import { validators } from "components/interface/form/formValidators";
import { RightTabs } from "components/interface/side-controls";
import {
  getCalculatedFieldsByEva,
  getCalculatedFieldsByStation,
  getCalculatedFieldsByTraverse,
} from "store/processing/calculatedFields";

const EvaRightEva: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.eva.selectedEvaRightNavItem,
    refEqual
  );
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const evasEditing = useAppSelector((state) => state.eva.evasEditing, shallowEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid),
    deepEqual
  );
  const selectedEvaFromDb = useAppSelector(
    (state) => state.eva.evasFromDb.find((eva) => eva.uuid === selectedEvaUuid),
    deepEqual
  );
  const traverses = useAppSelector(
    (state) =>
      state.traverse.traverses.map((t) => {
        return { uuid: t.uuid, updatedAt: t.updatedAt };
      }),
    deepEqual
  );
  const traversesFromDb = useAppSelector(
    (state) =>
      state.traverse.traversesFromDb.map((t) => {
        return { uuid: t.uuid, updatedAt: t.updatedAt };
      }),
    deepEqual
  );

  const calculatedFields = useAppSelector(
    (state) =>
      getCalculatedFieldsByEva({
        evaUuid: selectedEvaUuid,
        wholeStoreState: state,
      }),
    deepEqual
  );

  const traverseCalculatedFieldsInSequence = useAppSelector((state) => {
    const eva = state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid);
    if (!eva) return [];
    const traverseUuidsInThisEva: string[] = [];
    eva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "traverse") {
        traverseUuidsInThisEva.push(sequenceItem.uuid);
      }
    });
    const traverseCalculatedFields: TraverseCalculatedFields[] = [];
    for (const traverseUuid of traverseUuidsInThisEva) {
      traverseCalculatedFields.push(
        getCalculatedFieldsByTraverse({
          traverseUuid,
          wholeStoreState: state,
        })
      );
    }
    return traverseCalculatedFields;
  }, deepEqual);

  const stationCalculatedFieldsInSequence = useAppSelector((state) => {
    const eva = state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid);
    if (!eva) return [];
    const stationUuidsInThisEva: string[] = [];
    eva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "station") {
        stationUuidsInThisEva.push(sequenceItem.uuid);
      }
    });
    const stationCalculatedFields: StationCalculatedFields[] = [];
    for (const stationUuid of stationUuidsInThisEva) {
      stationCalculatedFields.push(
        getCalculatedFieldsByStation({
          stationUuid,
          wholeStoreState: state,
        })
      );
    }
    return stationCalculatedFields;
  }, deepEqual);

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const [evaReportSequenceItems, setEvaReportSequenceItems] = useState<EvaReportSequenceItem[]>([]);

  const evaModifieid = isModified([selectedEva], [selectedEvaFromDb]);

  const traverseUuidsInThisEva: string[] = [];
  selectedEva.sequence.forEach((sequenceItem) => {
    if (sequenceItem.type === "traverse") {
      traverseUuidsInThisEva.push(sequenceItem.uuid);
    }
  });
  const thisEvasTraverses = traverses.filter((traverse) => {
    return traverseUuidsInThisEva.includes(traverse.uuid);
  });
  const thisEvasTraversesFromDb = traversesFromDb.filter((traverse) => {
    return traverseUuidsInThisEva.includes(traverse.uuid);
  });
  const traversesModified = isModified(thisEvasTraverses, thisEvasTraversesFromDb);
  const modified = evaModifieid || traversesModified;

  // generate evaReportSequenceItems from the eva sequence
  useEffect(() => {
    const generateEvaReportSequenceItemsAsync = async () => {
      const evaReportSequenceItems: EvaReportSequenceItem[] = [];
      if (selectedEva) {
        for (const sequenceItem of selectedEva.sequence) {
          const seqItemRes = await dispatch(thunkGetStationOrTraverse({ uuid: sequenceItem.uuid }));
          if (!seqItemRes.payload) continue;

          if (seqItemRes.payload.type === "traverse") {
            const traverse = seqItemRes.payload.item as Traverse;
            const travereCalculatedFields = traverseCalculatedFieldsInSequence.find(
              (traverseCalculatedFields) => traverseCalculatedFields.uuid === sequenceItem.uuid
            );
            if (traverse) {
              evaReportSequenceItems.push({
                type: "traverse",
                uuid: traverse.uuid,
                name: traverse.name,
                reportItems: travereCalculatedFields?.reportItems,
              });
            }
          } else if (seqItemRes.payload.type === "station") {
            const station = seqItemRes.payload.item as Station;
            const stationCalculatedFields = stationCalculatedFieldsInSequence.find(
              (stationCalculatedFields) => stationCalculatedFields.uuid === sequenceItem.uuid
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
    selectedEva,
    traverseCalculatedFieldsInSequence,
    stationCalculatedFieldsInSequence,
    dispatch,
  ]);

  const [reportsTabIconColor, setReportsTabIconColor] = useState<string>("var(--eva)");
  const [reportsTabIcon, setReportsTabIcon] = useState<IconDefinition>(faTriangleExclamation);

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "EVA Information",
      panel: <Info_Panel editMode={evasEditing.includes(selectedEvaUuid)} />,
      selectedColor: "white",
      icon: faCircleInfo,
    },
    actions_panel: {
      title: "EVA Actions",
      panel: <Actions_Panel editMode={false} />,
      selectedColor: "white",
      icon: faPersonDigging,
    },
    report_panel: {
      title: "Reports",
      panel: (
        <Report_Panel
          reportItems={calculatedFields?.reportItems}
          evaReportItems={evaReportSequenceItems}
          reportTitle={"EVA Report"}
        />
      ),
      selectedColor: !_.isNull(reportsTabIconColor) ? reportsTabIconColor : "var(--eva)",
      unselectedColor: reportsTabIconColor,
      icon: reportsTabIcon,
    },
  };

  // set reports tab icon color
  useEffect(() => {
    setReportsTabIconColor(getAlertColor(calculatedFields?.reportItems, evaReportSequenceItems));
  }, [calculatedFields, evaReportSequenceItems]);

  let activeComponent: FunctionComponent = null;
  if (!_.isNil(panelTypes[selectedRightNavItem])) {
    activeComponent = panelTypes[selectedRightNavItem].panel;
  }

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
    selectedEva && (
      <>
        <div className={paneStyles.rightTopTitle}>
          <div className={paneStyles.rightTopTitleText} style={{ color: "var(--eva)" }}>
            <InLineEditInput
              value={selectedEva.name}
              editing={evasEditing.includes(selectedEvaUuid)}
              fieldProps={{
                name: "name",
                ariaLabel: "Station",
                style: {
                  width: "100%",
                  color: "var(--eva)",
                  fontSize: "1em",
                },
                validators: [validators.required, validators.maxLength(255)],
              }}
              styleValue={{ padding: 0, height: "auto" }}
              styleContainer={{ paddingLeft: 0 }}
              onSubmit={(val) => {
                dispatch(upsertEvaByField(selectedEva.uuid, "name", val));
              }}
              key={`${selectedEva.uuid}-name`}
              toFocus={selectedEva.createdAt === selectedEva.updatedAt}
            />
          </div>
        </div>
        <div className={paneStyles.rightSubTray}>
          <RightTabs
            selectedRightNavItem={selectedRightNavItem}
            panelTypes={panelTypes}
            dispatchFunction={setSelectedEvaRightNavItem}
          />
          <div className={paneStyles.saveCancelContainer}>
            {evasEditing.includes(selectedEvaUuid) && (
              <Button
                icon={faTrashAlt}
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete this EVA?")) {
                    dispatch(thunkDeleteEva({ evaUuid: selectedEva.uuid }));
                  }
                }}
                toolTip="Delete EVA"
                style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
              />
            )}
            {!evasEditing.includes(selectedEvaUuid) && editPerms && (
              <Button
                icon={faEdit}
                onClick={() => {
                  dispatch(setEvaEditMode({ evaUuid: selectedEva.uuid, editMode: true }));
                }}
                label="Edit"
                toolTip="Edit EVA"
                style={{ width: "60px", fontSize: "0.9em" }}
                labelStyle={{ marginTop: "2px" }}
              />
            )}

            {evasEditing.includes(selectedEvaUuid) && (
              <>
                <Button
                  onClick={() => {
                    if (modified) {
                      dispatch(thunkSaveEva({ evaUuid: selectedEva.uuid }));
                    }
                  }}
                  icon={faFloppyDisk}
                  toolTip={`Save EVA${modified ? "" : " (nothing to save)"}`}
                  enabled={modified}
                  style={{
                    width: "30px",
                    backgroundColor: modified ? "var(--alert)" : "var(--alert-disabled)",
                    color: modified ? "white" : "var(--grey4)",
                    fontSize: "0.9em",
                    paddingLeft: "10px",
                  }}
                />
                <Button
                  onClick={() => {
                    dispatch(thunkEvaCancel({ evaUuid: selectedEva.uuid }));
                  }}
                  icon={faBan}
                  toolTip="Cancel Edit"
                  style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
                />
              </>
            )}
          </div>
        </div>
        {activeComponent}
      </>
    )
  );
};

export default EvaRightEva;
