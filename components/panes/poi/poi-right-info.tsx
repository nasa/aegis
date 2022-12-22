import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faLocationDot, faMapLocationDot } from "@fortawesome/free-solid-svg-icons";
import {
  ColorDropdown,
  ContentEditableTextArea,
  IconButton,
  InLineEditInput,
  MultiButton,
  Tags,
} from "components/interface/_global-elements";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";
import { upsertPoi } from "store/poi";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedPoiUuid = useSelector(
    (state: RootState) => state.poi.selectedPoiUuid,
    shallowEqual
  );
  const pois: POI[] = useSelector((state: RootState) => state.poi.pois, shallowEqual);
  const selectedPoi = pois.find((poi) => poi.uuid === selectedPoiUuid);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Information</div>
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
            <button>Archived</button>
            <button>Candidate</button>
            <button>In Review</button>
            <button>Approved</button>
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
                  style={{ width: "45px" }}
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
                  { value: "red", label: "Red" },
                  { value: "blue", label: "Blue" },
                  { value: "green", label: "Green" },
                  { value: "yellow", label: "Yellow" },
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
          <div className={paneStyles.panelSectionTitle}>Position</div>

          <div className={paneStyles.panelSectionRow} style={{ marginTop: "3px", gap: "5px" }}>
            <div className={paneStyles.verticalCenter}>
              <FontAwesomeIcon icon={faLocationDot} />
            </div>
            <div className={paneStyles.verticalCenter}>
              <div className={paneStyles.panelText}>0.00000, 0.00000</div>
            </div>
            {editMode && (
              <IconButton
                onClick={() => {}}
                icon={faMapLocationDot}
                label="Edit Location"
                style={{ width: "110px" }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
