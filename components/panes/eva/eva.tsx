import _ from "lodash";
import { FunctionComponent } from "react";

import styles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import EvaItem from "./eva-item";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { Button } from "components/interface/form/globalFields";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCreateEva, thunkDuplicateEva } from "store/thunk/thunkEva";
import { hasEditPermissions } from "store/selectors";

const EvaPlannerLeft: FunctionComponent = () => {
  const thunkDispatch = useAppDispatch();
  const evas = useAppSelector((state) => state.eva.evas, shallowEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid),
    shallowEqual
  );
  const missionId = useAppSelector((state) => state.mission.mission?.id, refEqual);
  const isAdmin: boolean = useAppSelector(hasEditPermissions(missionId), refEqual);

  return (
    <>
      <div className={styles.evasLeftContainer}>
        <div className={styles.evasLeftBody}>
          {_.sortBy(evas, ["name"]).map((eva) => (
            <div className={styles.evaPanelContainer} key={eva.uuid}>
              <EvaItem eva={eva} key={eva.uuid} />
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className={styles.evasLeftFooter}>
            <div className={paneStyles.iconButtons}>
              <Button
                onClick={() => {
                  thunkDispatch(thunkCreateEva());
                }}
                label="Add"
                icon={faPlusCircle}
                style={{ width: "65px" }}
              />
              <Button
                onClick={() => {
                  if (selectedEva) {
                    thunkDispatch(thunkDuplicateEva({ eva: selectedEva }));
                  }
                }}
                label="Duplicate"
                icon={faClone}
                enabled={!_.isNull(selectedEva)}
                style={{ width: "95px" }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default EvaPlannerLeft;
