import paneStyles from "../global-pane-styles.module.css";
import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
import { setEvaEditMode, setSelectedEvaRightNavItem, upsertEva } from "store/eva";
import { getAlertColor } from "utils/component-helpers";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  thunkDeleteEva,
  thunkEvaCancel,
  thunkGetStationOrTraverse,
  thunkSaveEva,
} from "store/thunk/thunkEva";
import { validators } from "components/interface/form/formValidators";

const EvaRightEva: FunctionComponent = () => {
  const dispatch = useDispatch();
  const thunkDispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.eva.selectedEvaRightNavItem,
    shallowEqual
  );
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, shallowEqual);
  const evasEditing = useAppSelector((state) => state.eva.evasEditing, shallowEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid),
    shallowEqual
  );
  const selectedEvaFromDb = useAppSelector(
    (state) => state.eva.evasFromDb.find((eva) => eva.uuid === selectedEvaUuid),
    shallowEqual
  );
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const traversesFromDb = useAppSelector((state) => state.traverse.traversesFromDb, shallowEqual);
  const allTraverseCalculatedFields = useAppSelector(
    (state) => state.traverse.calculatedFields,
    shallowEqual
  );
  const allStationCalculatedFields = useAppSelector(
    (state) => state.station.calculatedFields,
    shallowEqual
  );
  const calculatedFields = useAppSelector(
    (state) =>
      state.eva.calculatedFields.find((calculated) => calculated.uuid === selectedEva?.uuid),
    shallowEqual
  );
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const [evaReportSequenceItems, setEvaReportSequenceItems] = useState<EvaReportSequenceItem[]>([]);
  const [modified, setModified] = useState(false); //track modified

  useEffect(() => {
    const evaEqual = _.isEqual(selectedEva, selectedEvaFromDb);

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
    const traversesEqual = _.isEqual(
      _.sortBy(thisEvasTraverses, ["uuid"]),
      _.sortBy(thisEvasTraversesFromDb, ["uuid"])
    );
    setModified(!evaEqual || !traversesEqual);
  }, [selectedEva, selectedEvaFromDb, traverses, traversesFromDb]);

  // generate evaReportSequenceItems from the eva sequence
  useEffect(() => {
    (async () => {
      const evaReportSequenceItems: EvaReportSequenceItem[] = [];
      if (selectedEva) {
        for (const sequenceItem of selectedEva.sequence) {
          const seqItemRes = await thunkDispatch(
            thunkGetStationOrTraverse({ uuid: sequenceItem.uuid })
          );
          if (!seqItemRes.payload) continue;

          if (seqItemRes.payload.type === "traverse") {
            const traverse = seqItemRes.payload.item as Traverse;
            const travereCalculatedFields = allTraverseCalculatedFields.find(
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
            const stationCalculatedFields = allStationCalculatedFields.find(
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
    })();
  }, [selectedEva, allTraverseCalculatedFields, allStationCalculatedFields, thunkDispatch]);

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
                dispatch(upsertEva({ ...selectedEva, name: val }));
              }}
            />
          </div>
        </div>
        <div className={paneStyles.rightSubTray}>
          <div className={paneStyles.rightIconRow}>
            {panelTypes &&
              Object.keys(panelTypes).map((panelType) => {
                const unselectedColor = _.has(panelTypes[panelType], "unselectedColor")
                  ? panelTypes[panelType].unselectedColor
                  : "white";
                return (
                  <div
                    key={panelType}
                    className={
                      selectedRightNavItem === panelType
                        ? paneStyles.rightIconContainerSelected
                        : paneStyles.rightIconContainer
                    }
                  >
                    <div
                      className={paneStyles.rightIcon}
                      style={{
                        color:
                          selectedRightNavItem === panelType
                            ? panelTypes[panelType].selectedColor
                            : unselectedColor,
                      }}
                      data-tooltip-id="aegis-tooltip"
                      data-tooltip-html={panelTypes[panelType].title}
                      onClick={() => dispatch(setSelectedEvaRightNavItem(panelType))}
                    >
                      <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
                    </div>
                  </div>
                );
              })}
          </div>
          <div className={paneStyles.saveCancelContainer}>
            {evasEditing.includes(selectedEvaUuid) && (
              <Button
                icon={faTrashAlt}
                onClick={() => {
                  thunkDispatch(thunkDeleteEva({ eva: selectedEva }));
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
                    thunkDispatch(thunkSaveEva({ eva: selectedEva }));
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
                    thunkDispatch(thunkEvaCancel({ eva: selectedEva }));
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
