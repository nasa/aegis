import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faLocationDot, faMapLocationDot, faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  ColorDropdown,
  ContentEditableTextArea,
  IconButton,
  InLineEditInput,
  MultiButton,
  Tags,
} from "components/interface/_global-elements";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import { upsertPoi } from "store/poi";
import { upsertUserMapObject } from "store/map";
import _ from "lodash";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedPoi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === state.poi.selectedPoiUuid),
    shallowEqual
  );
  const userMapObject = useAppSelector(
    (state) => state.map.userMapObjects.find((mapObject) => mapObject.uuid === selectedPoi.uuid),
    shallowEqual
  );
  const mapAction = userMapObject ? userMapObject.mapAction : null;

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Status</div>
            <MultiButton
              editing={editMode}
              selected={selectedPoi.status}
              handleChange={(newStatus) => {
                console.log(newStatus);
                dispatch(upsertPoi({ ...selectedPoi, status: newStatus }));
              }}
            >
              <button type="button">Archived</button>
              <button type="button">Candidate</button>
              <button type="button">In Review</button>
              <button type="button">Approved</button>
            </MultiButton>
          </div>
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
                    onChange={(val) => {
                      dispatch(upsertPoi({ ...selectedPoi, radius: val }));
                    }}
                  />
                </div>
              </div>
              <div className={paneStyles.panelColorDropdownContainer}>
                <div className={paneStyles.panelSectionTitle}>Color</div>
                <ColorDropdown
                  selected={selectedPoi.color}
                  editing={editMode}
                  setSelected={(value) => {
                    dispatch(upsertPoi({ ...selectedPoi, color: value }));
                  }}
                  items={[
                    { label: "Red", value: "1F534" },
                    { label: "Blue", value: "1F535" },
                    { label: "Green", value: "1F7E2" },
                    { label: "Yellow", value: "1F7E1" },
                    { label: "Purple", value: "1F7E3" },
                    { label: "Orange", value: "1F7E0" },
                    { label: "Brown", value: "1F7E4" },
                    { label: "Black", value: "26AB" },
                    { label: "White", value: "26AA" },
                  ]}
                ></ColorDropdown>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Metatags</div>
            <Tags
              value={selectedPoi.tags}
              editing={editMode}
              onChange={(value) => {
                dispatch(upsertPoi({ ...selectedPoi, tags: value }));
              }}
              name="tags"
              separators={["Enter", " "]}
              placeHolder="type tag and press enter"
              onExisting={() => {}}
            ></Tags>
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
                          dispatch(
                            upsertUserMapObject({
                              mapItemType: "poi",
                              uuid: selectedPoi.uuid,
                              createdAt: new Date().toISOString(),
                              mapAction: "create",
                            })
                          );
                        }}
                        icon={faMapLocationDot}
                        label="Create Location"
                        style={{ width: "125px" }}
                      />
                    ) : (
                      <IconButton
                        onClick={() => {
                          dispatch(
                            upsertUserMapObject({
                              mapItemType: "poi",
                              uuid: selectedPoi.uuid,
                              createdAt: new Date().toISOString(),
                              mapAction: "edit",
                            })
                          );
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
                {editMode && mapAction === "create" && (
                  <IconButton
                    onClick={() => {
                      dispatch(
                        upsertUserMapObject({
                          mapItemType: "poi",
                          uuid: selectedPoi.uuid,
                          createdAt: new Date().toISOString(),
                          mapAction: "cancelCreate",
                        })
                      );
                    }}
                    icon={faXmark}
                    label="Cancel"
                    style={{ width: "70px" }}
                  />
                )}
                {editMode && mapAction === "edit" && (
                  <>
                    <IconButton
                      onClick={() => {
                        dispatch(
                          upsertUserMapObject({
                            mapItemType: "poi",
                            uuid: selectedPoi.uuid,
                            createdAt: new Date().toISOString(),
                            mapAction: "cancelEdit",
                          })
                        );
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
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
