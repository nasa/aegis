import paneStyles from "components/panes/global-pane-styles.module.css";
import stationStyles from "./station.module.css";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import {
  faCircleInfo,
  faPersonDigging,
  faBan,
  faFloppyDisk,
  faTrashAlt,
  faEdit,
  faTriangleExclamation,
  faCheck,
  faCircle,
  faBullseye,
} from "@fortawesome/free-solid-svg-icons";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import {
  setSelectedStationRightNavItem,
  setStationEditMode,
  upsertStationByField,
} from "store/station";

import Info_Panel from "./station-right-info";
import Poi_Panel from "./station-right-poi";
import Actions_Panel from "./station-right-actions";
import Report_Panel from "../report";
import { decodeEmoji } from "utils/formatting";
import { getAlertColor, isModified } from "utils/component-helpers";
import Picker from "@emoji-mart/react";
import emojiPickerData from "@emoji-mart/data";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDeleteStation, thunkSaveStation, thunkStationCancel } from "store/thunk/thunkStation";
import { validators } from "components/interface/form/formValidators";
import { RightTabs } from "components/interface/side-controls";
import { getCalculatedFieldsByStation } from "store/processing/calculatedFields";
import Station_Circles_Panel from "./station-right-circles";

const StationEditorRight: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.station.selectedRightNavItem,
    refEqual
  );
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const stationsEditing = useAppSelector((state) => state.station.stationsEditing, shallowEqual);
  const selectedStation = useAppSelector(
    (state) => state.station.stations.find((station) => station.uuid === selectedStationUuid),
    deepEqual
  );
  const selectedStationFromDb = useAppSelector(
    (state) => state.station.stationsFromDb.find((station) => station.uuid === selectedStationUuid),
    deepEqual
  );

  const stationActions = useAppSelector(
    (state) =>
      state.action.actions
        .filter((storeAction) => storeAction.stationUuid === selectedStationUuid)
        .map((sa) => {
          return { uuid: sa.uuid, updatedAt: sa.updatedAt };
        }),
    deepEqual
  );
  const stationActionsFromDb = useAppSelector(
    (state) =>
      state.action.actionsFromDb
        .filter((storeAction) => storeAction.stationUuid === selectedStationUuid)
        .map((sa) => {
          return { uuid: sa.uuid, updatedAt: sa.updatedAt };
        }),
    deepEqual
  );

  const elevationPendingIndex = useAppSelector(
    (state) =>
      state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === selectedStationUuid),
    refEqual
  );
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const calculatedFieldsReportItems = useAppSelector(
    (state) =>
      getCalculatedFieldsByStation({
        stationUuid: selectedStationUuid,
        stations: state.station.stations,
        mission: state.mission.mission,
        actions: state.action.actions,
      })?.reportItems,
    deepEqual
  );

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    if (!stationsEditing.includes(selectedStationUuid)) setShowEmojiPicker(false);
  }, [stationsEditing, selectedStationUuid]);

  //track modified
  let saveButtonState = "pending";
  if (elevationPendingIndex < 0) {
    const stationModified = isModified([selectedStation], [selectedStationFromDb]);
    const actionModified = isModified(stationActions, stationActionsFromDb);
    const modified = stationModified || actionModified;
    saveButtonState = modified ? "enabled" : "disabled";
  }

  // set reports tab icon color
  const reportsTabIconColor = getAlertColor(calculatedFieldsReportItems);

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "Station Information",
      panel: Info_Panel,
      panelProps: {
        editMode: stationsEditing.includes(selectedStationUuid),
      },
      selectedColor: "white",
      icon: faCircleInfo,
    },
    poi_panel: {
      title: "Station POIs",
      panel: Poi_Panel,
      panelProps: { editMode: stationsEditing.includes(selectedStationUuid) },
      selectedColor: "white",
      icon: faCircle,
    },
    actions_panel: {
      title: "Station Actions",
      panel: Actions_Panel,
      panelProps: {
        editMode: stationsEditing.includes(selectedStationUuid),
      },
      selectedColor: "white",
      icon: faPersonDigging,
    },
    circle_panel: {
      title: "Proximity Circles Display",
      panel: Station_Circles_Panel,
      panelProps: {
        editMode: stationsEditing.includes(selectedStationUuid),
      },
      selectedColor: "white",
      icon: faBullseye,
    },

    report_panel: {
      title: "Station Report",
      panel: Report_Panel,
      panelProps: {
        reportItems: calculatedFieldsReportItems,
        reportTitle: "Station Report",
      },
      selectedColor: reportsTabIconColor === "var(--alert)" ? "var(--error)" : "white",
      unselectedColor: reportsTabIconColor,
      icon: calculatedFieldsReportItems?.length > 0 ? faTriangleExclamation : faCheck,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ActiveComponent: FunctionComponent<any> = panelTypes[selectedRightNavItem]?.panel;

  return (
    selectedStation && (
      <>
        <div className={paneStyles.rightTopTitle}>
          <div className={paneStyles.rightTopTitleIcon}>
            {decodeEmoji(selectedStation.icon ? selectedStation.icon : "2754")}
          </div>
          {stationsEditing.includes(selectedStationUuid) && (
            <>
              <div className={stationStyles.iconDisplayButton}>
                <Button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  label={!showEmojiPicker ? "Pick Icon" : "Close"}
                  style={{ width: "75px", height: "35px" }}
                />
              </div>
              <div className={stationStyles.iconPickerContainer}>
                {showEmojiPicker && (
                  <div className={stationStyles.iconPicker}>
                    <Picker
                      data={emojiPickerData}
                      emojiButtonSize={30}
                      emojiSize={20}
                      perLine={10}
                      darkMode={true}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      onEmojiSelect={(e: any) => {
                        dispatch(upsertStationByField(selectedStation.uuid, "icon", e.unified));
                        setShowEmojiPicker(false);
                      }}
                    />
                  </div>
                )}
              </div>
            </>
          )}
          <div className={paneStyles.rightTopTitleText} style={{ color: "var(--station)" }}>
            <InLineEditInput
              value={selectedStation.name}
              editing={stationsEditing.includes(selectedStationUuid)}
              fieldProps={{
                name: "name",
                ariaLabel: "Station",
                style: {
                  width: "100%",
                  color: "var(--station)",
                  fontSize: "1em",
                },
                validators: [validators.required, validators.maxLength(255)],
              }}
              styleValue={{ padding: 0, height: "auto" }}
              styleContainer={{ paddingLeft: 0 }}
              onSubmit={(val) => {
                dispatch(upsertStationByField(selectedStation.uuid, "name", val));
              }}
              key={`${selectedStation.uuid}-name`}
              toFocus={selectedStation.createdAt === selectedStation.updatedAt}
            />
          </div>
        </div>
        <div className={paneStyles.rightSubTray}>
          <RightTabs
            selectedRightNavItem={selectedRightNavItem}
            panelTypes={panelTypes}
            dispatchFunction={setSelectedStationRightNavItem}
          />
          <div className={paneStyles.saveCancelContainer}>
            {stationsEditing.includes(selectedStationUuid) && !(saveButtonState === "pending") ? (
              <Button
                ariaLabel="deleteStation"
                icon={faTrashAlt}
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete this Station?")) {
                    dispatch(
                      thunkDeleteStation({
                        station: selectedStation,
                      })
                    );
                  }
                }}
                toolTip="Delete Station"
                style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
              />
            ) : (
              <></>
            )}
            {!stationsEditing.includes(selectedStationUuid) && editPerms && (
              <Button
                ariaLabel="editStation"
                icon={faEdit}
                onClick={() => {
                  dispatch(
                    setStationEditMode({ stationUuid: selectedStation.uuid, editMode: true })
                  );
                }}
                label="Edit"
                toolTip="Edit Station"
                style={{ width: "60px", fontSize: "0.9em" }}
                labelStyle={{ marginTop: "2px" }}
              />
            )}

            {stationsEditing.includes(selectedStationUuid) ? (
              saveButtonState === "pending" ? (
                <>
                  <span className={stationStyles.statusLoading} />
                </>
              ) : (
                <>
                  <Button
                    ariaLabel="saveStation"
                    onClick={() => {
                      if (saveButtonState === "enabled") {
                        dispatch(
                          thunkSaveStation({
                            station: selectedStation,
                          })
                        );
                      }
                    }}
                    icon={faFloppyDisk}
                    toolTip={`Save Station${
                      saveButtonState === "enabled" ? "" : " (nothing to save)"
                    }`}
                    enabled={saveButtonState === "enabled"}
                    style={{
                      width: "30px",
                      backgroundColor:
                        saveButtonState === "enabled" ? "var(--alert)" : "var(--alert-disabled)",
                      color: saveButtonState === "enabled" ? "white" : "var(--grey4)",
                      fontSize: "0.9em",
                      paddingLeft: "10px",
                    }}
                  />
                  <Button
                    ariaLabel="cancelStation"
                    onClick={() => {
                      dispatch(
                        thunkStationCancel({
                          station: selectedStation,
                        })
                      );
                    }}
                    icon={faBan}
                    toolTip="Cancel Edit"
                    style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
                  />
                </>
              )
            ) : (
              <></>
            )}
          </div>
        </div>
        <ActiveComponent {...panelTypes[selectedRightNavItem]?.panelProps} />
      </>
    )
  );
};

export default StationEditorRight;
