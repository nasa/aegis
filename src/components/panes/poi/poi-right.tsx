import type { FunctionComponent } from "react";
import { useMemo } from "react";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import {
  faCircleInfo,
  faPersonDigging,
  faTrashAlt,
  faTriangleExclamation,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { Button, IconDropdown } from "components/interface/form/globalFields";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import { setSelectedPOIRightNavItem } from "store/poi";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdatePoiByField } from "operations/apply/apply-poi";
import Info_Panel from "./poi-right-info";
import Actions_Panel from "./poi-right-actions";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDocDeletePoi } from "store/thunk/thunkPoi";
import Report_Panel from "../report";
import { getAlertColor } from "utils/component-helpers";
import { validators } from "components/interface/form/formValidators";
import { RightTabs } from "components/interface/side-controls";
import { getCalculatedFieldsByPoi } from "store/processing/calculatedFields";
import isNull from "lodash/isNull";
import { useMissionDocSelector } from "utils/useDocSelector";

const PoiEditorRight: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector((state) => state.poi.selectedRightNavItem, refEqual);
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const docMaps = useMissionDocSelector(
    (mission) => ({
      pois: mission.pois,
      actions: mission.actions,
      stations: mission.stations,
    }),
    shallowEqual
  );
  const selectedPoi = useMemo(
    () => (selectedPoiUuid ? docMaps?.pois[selectedPoiUuid] : undefined),
    [docMaps, selectedPoiUuid]
  );
  const isInEditMode = useAppSelector((state) => state.mission.isInEditMode, refEqual);
  const calculatedFieldsReportItems = useMemo(() => {
    if (!docMaps) return [];
    const poiActions = Object.values(docMaps.actions).filter(
      (a) => a.poiUuid === selectedPoiUuid && a.enabled
    );
    return getCalculatedFieldsByPoi({ poiUuid: selectedPoiUuid, poiActions })?.reportItems ?? [];
  }, [docMaps, selectedPoiUuid]);
  const otherPoiNames = useMemo(
    () =>
      docMaps
        ? Object.values(docMaps.pois)
            .filter((poi) => poi.uuid !== selectedPoiUuid)
            .map((poi) => poi.name)
        : [],
    [docMaps, selectedPoiUuid]
  );
  const stationNamesAssociatedWithPoi = useMemo(
    () =>
      docMaps
        ? Object.values(docMaps.stations)
            .filter((station) => station.poiUuids?.includes(selectedPoiUuid))
            .map((s) => s.name)
        : [],
    [docMaps, selectedPoiUuid]
  );

  const reportsTabIconColor = getAlertColor(calculatedFieldsReportItems) || "var(--station)";

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "POI Information",
      panel: Info_Panel,
      panelProps: {
        editMode: isInEditMode,
      },
      selectedColor: "white",
      icon: faCircleInfo,
    },
    actions_panel: {
      title: "POI Actions",
      panel: Actions_Panel,
      panelProps: {
        editMode: isInEditMode,
      },
      selectedColor: "white",
      icon: faPersonDigging,
    },
    report_panel: {
      title: "POI Report",
      panel: Report_Panel,
      panelProps: {
        reportItems: calculatedFieldsReportItems,
        reportTitle: "POI Report",
      },
      selectedColor: !isNull(reportsTabIconColor) ? reportsTabIconColor : "white",
      unselectedColor: reportsTabIconColor,
      icon: calculatedFieldsReportItems.length > 0 ? faTriangleExclamation : faCheck,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ActiveComponent: FunctionComponent<any> = panelTypes[selectedRightNavItem]?.panel;

  return (
    selectedPoi && (
      <>
        <div className={paneStyles.rightTopTitle}>
          <IconDropdown
            selected={selectedPoi.icon}
            editing={isInEditMode}
            setSelected={(value: string) => {
              withMissionChange((m) =>
                applyUpdatePoiByField(m, {
                  poiUuid: selectedPoi.uuid,
                  fieldName: "icon",
                  value,
                })
              );
            }}
            items={[
              "1F534",
              "1F7E0",
              "1F7E1",
              "1F7E2",
              "1F535",
              "1F7E3",
              "1F7E4",
              "26AB",
              "26AA",
              "1F7E5",
              "1F7E7",
              "1F7E8",
              "1F7E9",
              "1F7E6",
              "1F7EA",
              "1F7EB",
              "2B1B",
              "2B1C",
              "1F53A",
              "1F53B",
              "1F536",
              "1F537",
            ]}
          />

          <div className={paneStyles.rightTopTitleText}>
            <ValidatedInputField
              value={selectedPoi.name}
              editMode={isInEditMode}
              fieldProps={{
                name: "name",
                ariaLabel: "POI",
                validators: [
                  validators.required,
                  validators.maxLength(255),
                  validators.mustBeUnique(otherPoiNames),
                ],
              }}
              styleContainer={{ paddingRight: "10px" }}
              displayStyle={{ fontSize: "1.1em", color: "var(--poi)" }}
              onSubmit={(val: string) => {
                withMissionChange((m) =>
                  applyUpdatePoiByField(m, {
                    poiUuid: selectedPoi.uuid,
                    fieldName: "name",
                    value: val || "",
                  })
                );
              }}
              key={`${selectedPoi.uuid}-name`}
            />
          </div>
        </div>
        <div className={paneStyles.rightSubTray}>
          <RightTabs
            selectedRightNavItem={selectedRightNavItem}
            panelTypes={panelTypes}
            dispatchFunction={setSelectedPOIRightNavItem}
          />
          <div className={paneStyles.saveCancelContainer}>
            {isInEditMode && (
              <Button
                ariaLabel="deletePoi"
                icon={faTrashAlt}
                onClick={() => {
                  if (selectedPoi) {
                    let confirmMsg = "Are you sure you want to delete this POI?";
                    if (stationNamesAssociatedWithPoi.length > 0) {
                      // if the poi is associated with stations, show those station names in the confirm dialog
                      const stationList = stationNamesAssociatedWithPoi.join(", ");
                      confirmMsg += `\n\nThis POI is associated with the following station(s): ${stationList}`;
                    }
                    if (window.confirm(confirmMsg)) {
                      dispatch(
                        thunkDocDeletePoi({
                          poiUuid: selectedPoi.uuid,
                        })
                      );
                    }
                  }
                }}
                toolTip="Delete POI"
                style={{ width: "30px", fontSize: "0.9em", paddingLeft: "9px" }}
              />
            )}
          </div>
        </div>
        <ActiveComponent {...panelTypes[selectedRightNavItem]?.panelProps} />
      </>
    )
  );
};

export default PoiEditorRight;
