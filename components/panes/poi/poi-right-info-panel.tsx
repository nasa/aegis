import { createRef, FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faTableList, faLocationDot, faPen } from "@fortawesome/free-solid-svg-icons";
import { ColorDropdown, IconButton, MultiButton } from "components/interface/_global-elements";
import { TagsInput } from "react-tag-input-component";
import ContentEditable from "react-contenteditable";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";
import { upsertPoi } from "store/poi";

const Info_Panel: FunctionComponent = () => {
  const dispatch = useDispatch();
  const selectedPoiUuid = useSelector(
    (state: RootState) => state.poi.selectedPoiUuid,
    shallowEqual
  );
  const pois = useSelector((state: RootState) => state.poi.pois, shallowEqual);
  const selectedPoi = pois.find((poi) => poi.uuid === selectedPoiUuid);
  const contentEditable = createRef<HTMLElement>();

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.title}>Information</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>Status</div>
          <MultiButton
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
            <div className={paneStyles.panelSubSection} style={{ flex: "0 0 80px" }}>
              <div className={paneStyles.panelSectionTitle}>Radius</div>
              <div className={paneStyles.inputField}>
                <input
                  type="text"
                  maxLength={3}
                  style={{ width: "40px" }}
                  value={selectedPoi.radius}
                  onChange={(e) => {
                    dispatch(upsertPoi({ ...selectedPoi, radius: e.target.value }));
                  }}
                />
                <div className={paneStyles.inputFieldUnit}>m</div>
              </div>
            </div>
            <div className={paneStyles.panelSubSection} style={{ flex: 1 }}>
              <div className={paneStyles.panelSectionTitle}>Color</div>
              <ColorDropdown
                selected={selectedPoi.color}
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
          <div className={paneStyles.panelSubSection}>
            <div className={paneStyles.panelSectionTitle}>Metatags</div>
            <div className={paneStyles.tagsContainer}>
              <TagsInput
                value={selectedPoi.tags}
                onChange={(value) => {
                  dispatch(upsertPoi({ ...selectedPoi, tags: value }));
                }}
                name="tags"
                separators={["Enter", " "]}
                placeHolder="type tag and press enter"
                onExisting={() => {}}
              />
            </div>
          </div>
        </div>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSubSection}>
            <div className={paneStyles.panelSectionTitle}>Science Tracability</div>
            <IconButton
              onClick={() => {}}
              icon={faTableList}
              label="Select"
              style={{ width: "75px" }}
            />
          </div>
        </div>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSubSection}>
            <div className={paneStyles.panelSectionTitle}>POI Value & Notes</div>
            <ContentEditable
              className={paneStyles.notesTextArea}
              innerRef={contentEditable}
              html={selectedPoi.description} // innerHTML of the editable div
              disabled={false} // use true to disable editing
              onChange={(evt) => {
                dispatch(
                  upsertPoi({
                    ...selectedPoi,
                    description: evt.target.value,
                  })
                );
              }} // handle innerHTML change
              tagName="div" // Use a custom HTML tag (uses a div by default)
            />
          </div>
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
            <IconButton onClick={() => {}} icon={faPen} label="Edit" style={{ width: "60px" }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
