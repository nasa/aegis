import _ from "lodash";
import { FunctionComponent } from "react";

import styles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import EvaItem from "./eva-item";
import { refEqual, deepEqual, useAppSelector } from "utils/useAppSelector";
import { Button } from "components/interface/form/globalFields";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCreateEva, thunkDuplicateEva } from "store/thunk/thunkEva";

const EvaPlannerLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const evas = useAppSelector((state) => state.eva.evas, deepEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid),
    deepEqual
  );
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  return (
    <>
      <div className={styles.evasLeftContainer}>
        <div className={styles.evasLeftBody} aria-label="evaList">
          {_.sortBy(evas, ["name"]).map((eva) => (
            <div className={styles.evaPanelContainer} key={eva.uuid} aria-label="evaList-item">
              <EvaItem eva={eva} key={eva.uuid} />
            </div>
          ))}
        </div>

        {editPerms && (
          <div className={styles.evasLeftFooter}>
            <div className={paneStyles.iconButtons}>
              <Button
                ariaLabel="addEva"
                onClick={() => {
                  dispatch(thunkCreateEva());
                }}
                label="Add"
                icon={faPlusCircle}
                style={{ width: "65px" }}
                toolTip="Add a new EVA"
              />
              <Button
                ariaLabel="duplicateEva"
                onClick={() => {
                  if (selectedEva) {
                    dispatch(thunkDuplicateEva({ eva: selectedEva, includeStations: false }));
                  }
                }}
                label="Duplicate"
                icon={faClone}
                enabled={!!selectedEva}
                style={{ width: "95px" }}
                toolTip="Duplicate this EVA and its Traverses"
              />
              <Button
                ariaLabel="duplicateEvaWithStations"
                onClick={() => {
                  if (selectedEva) {
                    if (
                      confirm(
                        "This will duplicate the EVA and also make duplicates of all stations in this EVA and will name them 'station name (copy X)'. Are you sure?"
                      )
                    ) {
                      dispatch(thunkDuplicateEva({ eva: selectedEva, includeStations: true }));
                    }
                  }
                }}
                label="Duplicate w/ Stations"
                icon={faClone}
                enabled={!!selectedEva}
                style={{ width: "160px" }}
                toolTip="Duplicate this EVA and its Traverses and Stations"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default EvaPlannerLeft;
