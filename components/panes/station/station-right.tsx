import paneStyles from "components/panes/global-pane-styles.module.css";
import stationStyles from "./station.module.css";
import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { faCircleDot } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faPersonDigging,
  faBan,
  faFloppyDisk,
  faTrashAlt,
  faEdit,
  faTriangleExclamation,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { setSelectedStationRightNavItem, setStationEditMode, upsertStation } from "store/station";

import Info_Panel from "./station-right-info";
import Poi_Panel from "./station-right-poi";
import Actions_Panel from "./station-right-actions";
import Report_Panel from "../report";
import { decodeEmoji } from "utils/formatting";
import { getAlertColor } from "utils/component-helpers";
import Picker from "@emoji-mart/react";
import emojiPickerData from "@emoji-mart/data";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDeleteStation, thunkSaveStation, thunkStationCancel } from "store/thunk/thunkStation";
import { validators } from "components/interface/form/formValidators";

const StationEditorRight: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.station.selectedRightNavItem,
    shallowEqual
  );
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    shallowEqual
  );
  const stationsEditing = useAppSelector((state) => state.station.stationsEditing, shallowEqual);
  const selectedStation = useAppSelector(
    (state) => state.station.stations.find((station) => station.uuid === selectedStationUuid),
    shallowEqual
  );
  const selectedStationFromDb = useAppSelector(
    (state) => state.station.stationsFromDb.find((station) => station.uuid === selectedStationUuid),
    shallowEqual
  );

  const stationActions = useAppSelector(
    (state) =>
      state.action.actions.filter((storeAction) => storeAction.stationUuid === selectedStationUuid),
    shallowEqual
  );
  const stationActionsFromDb = useAppSelector(
    (state) =>
      state.action.actionsFromDb.filter(
        (storeAction) => storeAction.stationUuid === selectedStationUuid
      ),
    shallowEqual
  );

  const elevationPendingIndex = useAppSelector(
    (state) =>
      state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === selectedStationUuid),
    shallowEqual
  );
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const calculatedFields = useAppSelector(
    (state) =>
      state.station.calculatedFields.find((calculated) => calculated.uuid === selectedStationUuid),
    shallowEqual
  );
  const [saveButtonState, setSaveButtonState] = useState<saveButtonState>("disabled");
  const [reportsTabIconColor, setReportsTabIconColor] = useState<string>("var(--station)");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "Station Information",
      panel: (
        <Info_Panel
          editMode={stationsEditing.includes(selectedStationUuid)}
          totalStationTime={calculatedFields?.totalTime}
          actionCount={calculatedFields?.actionCount}
        />
      ),
      selectedColor: "white",
      icon: faCircleInfo,
    },
    poi_panel: {
      title: "Station POIs",
      panel: <Poi_Panel editMode={stationsEditing.includes(selectedStationUuid)} />,
      selectedColor: "white",
      icon: faCircleDot,
    },
    actions_panel: {
      title: "Station Actions",
      panel: <Actions_Panel editMode={stationsEditing.includes(selectedStationUuid)} />,
      selectedColor: "white",
      icon: faPersonDigging,
    },
    report_panel: {
      title: "Station Report",
      panel: (
        <Report_Panel reportItems={calculatedFields?.reportItems} reportTitle={"Station Report"} />
      ),
      selectedColor: !_.isNull(reportsTabIconColor) ? reportsTabIconColor : "white",
      unselectedColor: reportsTabIconColor,
      icon: calculatedFields?.reportItems.length > 0 ? faTriangleExclamation : faCheck,
    },
  };
  //track modified
  useEffect(() => {
    if (elevationPendingIndex > -1) {
      setSaveButtonState("pending");
    } else {
      const stationEqual = _.isEqual(selectedStation, selectedStationFromDb);
      const actionEqual = _.isEqual(
        _.sortBy(stationActions, ["uuid"]),
        _.sortBy(stationActionsFromDb, ["uuid"])
      );
      const isModified = !stationEqual || !actionEqual;
      setSaveButtonState(isModified ? "enabled" : "disabled");
    }
  }, [
    elevationPendingIndex,
    selectedStation,
    selectedStationFromDb,
    stationActions,
    stationActionsFromDb,
  ]);

  // set reports tab icon color
  useEffect(() => {
    setReportsTabIconColor(getAlertColor(calculatedFields?.reportItems));
  }, [calculatedFields]);

  useEffect(() => {
    if (!stationsEditing.includes(selectedStationUuid)) setShowEmojiPicker(false);
  }, [stationsEditing, selectedStationUuid]);

  let activeComponent: FunctionComponent = null;
  if (!_.isNil(panelTypes[selectedRightNavItem])) {
    activeComponent = panelTypes[selectedRightNavItem].panel;
  }

  return (
    selectedStation && (
      <>
        <div className={paneStyles.rightTopTitle}>
          {selectedStation.icon ? (
            <div className={paneStyles.rightTopTitleIcon}>{decodeEmoji(selectedStation.icon)}</div>
          ) : (
            <div className={paneStyles.rightTopTitleIcon}>
              <div className={paneStyles.rightTopTitleNoIcon} />
            </div>
          )}
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
                        dispatch(upsertStation({ ...selectedStation, icon: e.unified }));
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
                dispatch(upsertStation({ ...selectedStation, name: val }));
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
                        ? paneStyles.rightIconContainerSelectedStation
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
                      onClick={() => dispatch(setSelectedStationRightNavItem(panelType))}
                    >
                      <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
                    </div>
                  </div>
                );
              })}
          </div>
          <div className={paneStyles.saveCancelContainer}>
            {stationsEditing.includes(selectedStationUuid) && !(saveButtonState === "pending") ? (
              <Button
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
                    onClick={() => {
                      dispatch(
                        thunkSaveStation({
                          station: selectedStation,
                        })
                      );
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
        {activeComponent}
      </>
    )
  );
};

export default StationEditorRight;
