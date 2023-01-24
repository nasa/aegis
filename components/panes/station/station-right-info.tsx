import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faLocationDot, faMapLocationDot } from "@fortawesome/free-solid-svg-icons";
import {
  ContentEditableTextArea,
  IconButton,
  InLineEditInput,
  MultiButton,
} from "components/interface/_global-elements";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";
import { upsertStation } from "store/station";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedStationUuid = useSelector(
    (state: RootState) => state.station.selectedStationUuid,
    shallowEqual
  );
  const stations: Station[] = useSelector(
    (state: RootState) => state.station.stations,
    shallowEqual
  );
  const selectedStation = stations.find((station) => station.uuid === selectedStationUuid);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Information</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>Status</div>
          <MultiButton
            editing={editMode}
            selected={selectedStation.status}
            handleChange={(newStatus) => {
              console.log(newStatus);
              dispatch(upsertStation({ ...selectedStation, status: newStatus }));
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
                  value={selectedStation.radius.toString()}
                  onChange={(val: string) => {
                    dispatch(upsertStation({ ...selectedStation, radius: +val }));
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>Station Value & Notes</div>
          <ContentEditableTextArea
            html={selectedStation.description} // innerHTML of the editable div
            editing={editMode}
            onChange={(evt) => {
              dispatch(
                upsertStation({
                  ...selectedStation,
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
