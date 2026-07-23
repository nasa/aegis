import paneStyles from "components/panes/global-pane-styles.module.css";
import stationStyles from "./station.module.css";
import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import {
  faCircleInfo,
  faPersonDigging,
  faTrashAlt,
  faTriangleExclamation,
  faCheck,
  faCircle,
  faBullseye,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "components/interface/form/globalFields";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import { setSelectedStationRightNavItem } from "store/station";

import Info_Panel from "./station-right-info";
import Poi_Panel from "./station-right-poi";
import Actions_Panel from "./station-right-actions";
import Report_Panel from "../report";
import { EmojiRenderer, EmojiPicker } from "components/interface/emojis";
import { getAlertColor } from "utils/component-helpers";
import { useAppDispatch } from "utils/useAppDispatch";

import { thunkDocDeleteStations } from "store/thunk/thunkStation";
import { validators } from "components/interface/form/formValidators";
import { RightTabs } from "components/interface/side-controls";
import { getCalculatedFieldsByStation } from "store/processing/calculatedFields";
import Station_Circles_Panel from "./station-right-circles";
import { selectAsPlannedStations } from "store/selectors";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange, withMissionOp } from "client/automergeDocHandles";
import { applyUpdateStationByField } from "operations/apply/apply-station";
import { opUpdateStationName } from "operations/op-station";

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
  const isInEditMode = useAppSelector((state) => state.mission.isInEditMode, refEqual);
  const selectedStation = useMissionDocSelector(
    (mission) => mission.stations[selectedStationUuid],
    deepEqual
  );

  const calculatedFieldsReportItems = useMissionDocSelector((mission) => {
    const stationActions = Object.values(mission.actions).filter(
      (a) => a.stationUuid === selectedStationUuid && a.enabled
    );
    return getCalculatedFieldsByStation({
      station: mission.stations[selectedStationUuid],
      missionWalkbackRate: mission.walkbackRate,
      stationActions,
    })?.reportItems;
  }, deepEqual);

  const otherStationNames = useMissionDocSelector(
    (mission) =>
      selectAsPlannedStations(mission).map(({ name, uuid }) => {
        if (uuid !== selectedStationUuid) {
          return name;
        }
      }),
    deepEqual
  );
  const isRexStation = useMissionDocSelector((mission) => {
    const asPlannedStationUuids = selectAsPlannedStations(mission).map((station) => station.uuid);
    return !asPlannedStationUuids.includes(selectedStationUuid);
  }, refEqual);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    if (!isInEditMode) setShowEmojiPicker(false);
  }, [isInEditMode]);

  // set reports tab icon color
  const reportsTabIconColor = getAlertColor(calculatedFieldsReportItems);

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "Station Information",
      panel: Info_Panel,
      panelProps: {
        editMode: isInEditMode,
      },
      selectedColor: "white",
      icon: faCircleInfo,
    },
    poi_panel: {
      title: "Station POIs",
      panel: Poi_Panel,
      panelProps: { editMode: isInEditMode },
      selectedColor: "white",
      icon: faCircle,
    },
    actions_panel: {
      title: "Station Actions",
      panel: Actions_Panel,
      panelProps: {
        editMode: isInEditMode,
      },
      selectedColor: "white",
      icon: faPersonDigging,
    },
    circle_panel: {
      title: "Proximity Circles Display",
      panel: Station_Circles_Panel,
      panelProps: {
        editMode: isInEditMode,
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
            <EmojiRenderer iconValue={selectedStation.icon ? selectedStation.icon : "2754"} />
          </div>
          {isInEditMode && (
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
                    <EmojiPicker
                      emojiButtonSize={30}
                      emojiSize={20}
                      perLine={10}
                      darkMode={true}
                      onEmojiSelect={(e) => {
                        // For custom emojis, use the id, for standard emojis use unified
                        const iconValue = e.unified || e.id;
                        withMissionChange((m) =>
                          applyUpdateStationByField(m, {
                            stationUuid: selectedStation.uuid,
                            fieldName: "icon",
                            value: iconValue,
                          })
                        );
                        setShowEmojiPicker(false);
                      }}
                    />
                  </div>
                )}
              </div>
            </>
          )}
          <div className={paneStyles.rightTopTitleText}>
            <ValidatedInputField
              value={selectedStation.name}
              editMode={isInEditMode}
              fieldProps={{
                name: "name",
                ariaLabel: "Station",
                validators: [
                  validators.required,
                  validators.maxLength(255),
                  validators.mustBeUnique(isRexStation ? [] : otherStationNames), // duplicate names are ok on rex eva stations
                ],
              }}
              styleContainer={{ paddingRight: "10px" }}
              displayStyle={{ fontSize: "1.1em", color: "var(--station)" }}
              onSubmit={(val: string) => {
                withMissionOp(opUpdateStationName, selectedStation.uuid, val || "");
              }}
              key={`${selectedStation.uuid}-name`}
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
            {isInEditMode && (
              <Button
                ariaLabel="deleteStation"
                icon={faTrashAlt}
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete this Station?")) {
                    dispatch(
                      thunkDocDeleteStations({
                        stationUuids: [selectedStation.uuid],
                      })
                    );
                  }
                }}
                toolTip="Delete Station"
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

export default StationEditorRight;
