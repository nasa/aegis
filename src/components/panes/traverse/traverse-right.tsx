import {
  faCheck,
  faCircleInfo,
  faPersonDigging,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import type { FunctionComponent } from "react";
import { setSelectedTraverseRightNavItem } from "store/traverse";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import Info_Panel from "./traverse-right-info";
import Report_Panel from "../report";
import Actions_Panel from "./traverse-right-actions";
import { getAlertColor } from "utils/component-helpers";
import { RightTabs } from "components/interface/side-controls";
import { getCalculatedFieldsByTraverse } from "store/processing/calculatedFields";
import isNull from "lodash/isNull";
import { useMissionDocSelector } from "utils/useDocSelector";

const TraverseEditorRight: FunctionComponent = () => {
  const selectedRightNavItem = useAppSelector(
    (state) => state.traverse.selectedTraverseRightNavItem,
    refEqual
  );
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const isInEditMode = useAppSelector((state) => state.mission.isInEditMode, refEqual);
  const selectedTraverseName = useMissionDocSelector(
    (mission) => mission.traverses[selectedEvaSequenceItemUuid]?.name,
    refEqual
  );

  const missionTraverseRate = useMissionDocSelector((mission) => mission.traverseRate, refEqual);

  const traverseEvaTraverseRate = useMissionDocSelector((mission) => {
    if (!mission?.evas) return null;
    return (
      Object.values(mission.evas).find((eva) =>
        eva.sequence.some((seqItem) => seqItem.uuid === selectedEvaSequenceItemUuid)
      )?.traverseRate ?? null
    );
  }, deepEqual);
  const calculatedFields = useMissionDocSelector((mission) => {
    const traverse = mission.traverses[selectedEvaSequenceItemUuid];
    const traverseActions = Object.values(mission.actions).filter(
      (a) => a.traverseUuid === traverse?.uuid && a.enabled
    );
    return getCalculatedFieldsByTraverse({
      traverse,
      missionTraverseRate,
      evaTraverseRate: traverseEvaTraverseRate,
      traverseActions,
    });
  }, deepEqual);

  // set reports tab icon color
  const reportsTabIconColor = getAlertColor(calculatedFields?.reportItems) || "white";

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "Traverse Information",
      panel: Info_Panel,
      panelProps: {
        editMode: isInEditMode,
      },
      selectedColor: "white",
      icon: faCircleInfo,
    },
    actions_panel: {
      title: "Traverse Actions",
      panel: Actions_Panel,
      panelProps: {
        editMode: isInEditMode,
      },
      selectedColor: "white",
      icon: faPersonDigging,
    },
    report_panel: {
      title: "Reports",
      panel: Report_Panel,
      panelProps: {
        reportItems: calculatedFields.reportItems,
        reportTitle: "Traverse Report",
      },
      selectedColor: !isNull(reportsTabIconColor) ? reportsTabIconColor : "white",
      unselectedColor: reportsTabIconColor,
      icon: calculatedFields.reportItems.length > 0 ? faTriangleExclamation : faCheck,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ActiveComponent: FunctionComponent<any> = panelTypes[selectedRightNavItem]?.panel;

  return (
    selectedTraverseName && (
      <>
        <div className={paneStyles.rightTopTitle}>
          <div className={paneStyles.rightTopTitleText} style={{ color: "var(--eva)" }}>
            {selectedTraverseName}
          </div>
        </div>
        <div className={paneStyles.rightSubTray}>
          <RightTabs
            selectedRightNavItem={selectedRightNavItem}
            panelTypes={panelTypes}
            dispatchFunction={setSelectedTraverseRightNavItem}
          />
        </div>

        <ActiveComponent {...panelTypes[selectedRightNavItem]?.panelProps} />
      </>
    )
  );
};

export default TraverseEditorRight;
