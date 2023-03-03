import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faLocationDot, faMapLocationDot, faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  IconDropdown,
  ContentEditableTextArea,
  IconButton,
  InLineEditInput,
  LastEdited,
} from "components/interface/_global-elements";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import { upsertPoi } from "store/poi";
import { updateMapDirective } from "store/map";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedPoi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === state.poi.selectedPoiUuid),
    shallowEqual
  );
  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === selectedPoi?.uuid ? mapDirective : null;

  const dispatchPoiMapAction = (mapAction: MapAction) => {
    dispatch(
      updateMapDirective({
        mapItemType: "poi",
        uuid: selectedPoi.uuid,
        mapAction,
      })
    );
  };

  const verifyNoActiveMapAction = (): boolean => {
    // if another mapAction is underway, fire an alert and return false
    if (mapDirective && mapDirective.mapAction !== null) {
      alert(
        "Another map action is underway. Please cancel or complete that action before creating a new one."
      );
      return false;
    } else {
      return true;
    }
  };

  const handleCreate = () => {
    if (verifyNoActiveMapAction()) {
      dispatchPoiMapAction("createMarker");
    }
  };
  const handleCancelCreate = () => {
    dispatchPoiMapAction("cancelCreateMarker");
  };

  const handleEdit = () => {
    if (verifyNoActiveMapAction()) {
      dispatchPoiMapAction("editMarker");
    }
  };

  const handleCancelEdit = () => {
    dispatchPoiMapAction("cancelEditMarker");
  };

  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>POI Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSmallField}>
                <div className={paneStyles.panelSectionTitle}>Radius (m)</div>
                <div className={paneStyles.inputField}>
                  <InLineEditInput
                    fieldName="Radius"
                    editing={editMode}
                    maxLength={4}
                    styleInput={{ width: "45px" }}
                    containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                    value={selectedPoi.radius.toString()}
                    onChange={(val: number) => {
                      dispatch(upsertPoi({ ...selectedPoi, radius: val }));
                    }}
                  />
                </div>
              </div>
              <div className={paneStyles.panelColorDropdownContainer}>
                <div className={paneStyles.panelSectionTitle}>Icon</div>
                <IconDropdown
                  selected={selectedPoi.icon}
                  editing={editMode}
                  setSelected={(value) => {
                    dispatch(upsertPoi({ ...selectedPoi, icon: value }));
                  }}
                  items={[
                    "1F534",
                    "1F535",
                    "1F7E2",
                    "1F7E1",
                    "1F7E3",
                    "1F7E0",
                    "1F7E4",
                    "26AB",
                    "26AA",
                  ]}
                ></IconDropdown>
              </div>
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>POI Value & Notes</div>
            <ContentEditableTextArea
              html={selectedPoi.description} // innerHTML of the editable div
              editing={editMode}
              onChange={(evt) => {
                dispatch(
                  upsertPoi({
                    ...selectedPoi,
                    description: evt.target.value,
                  })
                );
              }} // handle innerHTML change
            />
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Location</div>

            <div className={paneStyles.panelSectionRow} style={{ marginTop: "3px", gap: "5px" }}>
              <>
                {(selectedPoi.location || editMode) && (
                  <div className={paneStyles.verticalCenter}>
                    <FontAwesomeIcon icon={faLocationDot} />
                  </div>
                )}
                <div className={paneStyles.verticalCenter}>
                  <div className={paneStyles.panelText}>
                    {selectedPoi.location &&
                      `${selectedPoi.location?.lat.toFixed(8)}, ${selectedPoi.location?.lng.toFixed(
                        8
                      )}`}
                  </div>
                </div>
                {editMode && mapAction === null ? (
                  <>
                    {!selectedPoi.location ? (
                      <IconButton
                        onClick={() => {
                          handleCreate();
                        }}
                        icon={faMapLocationDot}
                        label="Create Location"
                        style={{ width: "125px" }}
                      />
                    ) : (
                      <IconButton
                        onClick={() => {
                          handleEdit();
                        }}
                        icon={faMapLocationDot}
                        label="Edit Location"
                        style={{ width: "110px" }}
                      />
                    )}
                  </>
                ) : (
                  <div className={paneStyles.buttonPlaceholder}></div>
                )}
                {editMode && mapAction === "createMarker" && (
                  <IconButton
                    onClick={() => {
                      handleCancelCreate();
                    }}
                    icon={faXmark}
                    label="Cancel"
                    style={{ width: "70px" }}
                  />
                )}
                {editMode && mapAction === "editMarker" && (
                  <>
                    <IconButton
                      onClick={() => {
                        handleCancelEdit();
                      }}
                      icon={faXmark}
                      label="Cancel"
                      style={{ width: "70px" }}
                    />
                  </>
                )}
                {!editMode && !selectedPoi.location && (
                  <div className={paneStyles.panelText}>Location not yet set</div>
                )}
              </>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Last Edited</div>
            <div className={paneStyles.verticalCenter}>
              <div className={paneStyles.panelText}>
                <LastEdited updatedAt={selectedPoi?.updatedAt} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
