import _ from "lodash";
import { FunctionComponent } from "react";

import styles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import EvaItem from "./eva-item";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { IconButton } from "components/interface/_global-elements";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { v4 as uuidv4 } from "uuid";
import {
  duplicateEva,
  setEvaEditMode,
  setExpandedEvaUuids,
  setSelectedEvaRightNavItem,
  setSelectedEvaSequenceItemUuid,
  setSelectedEvaUuid,
  upsertEva,
} from "store/eva";
import { useDispatch } from "react-redux";
import { generateUniqueName } from "utils/unique-name";
import { setRightPanelOpen } from "store/interface";

const EvaPlannerLeft: FunctionComponent = () => {
  const dispatch = useDispatch();
  const evas = useAppSelector((state) => state.eva.evas, shallowEqual);
  const expandedEvaUuids = useAppSelector((state) => state.eva.expandedEvaUuids, shallowEqual);

  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid),
    shallowEqual
  );
  const user: User = useAppSelector((state) => state.user.ironSessionData?.user, shallowEqual);
  const missionId = useAppSelector((state) => state.mission.mission?.id, refEqual);
  const isAdmin = useAppSelector(
    (state) => state.user.ironSessionData?.user.permission.includes("admin"),
    refEqual
  );
  const handleCreateEva = () => {
    const randomName = generateUniqueName({
      dictName: "colors",
      existingNames: evas.map((item) => item.name),
    });

    const blankEva: Eva = {
      ownerId: user.id,
      missionId: missionId,
      uuid: uuidv4(),
      name: randomName,
      status: "Candidate",
      sequence: [],
      description: "",
      traverseRate: 3.2, // default to 3.2 km/hr
      maxDuration: 240, // default to 4 hours
    };
    dispatch(upsertEva(blankEva));
    // turn on edit mode for the new Eva
    dispatch(setEvaEditMode({ evaUuid: blankEva.uuid, editMode: true }));
    // select the new Eva
    dispatch(setSelectedEvaUuid(blankEva.uuid));
    dispatch(setSelectedEvaSequenceItemUuid(null));
    // expand the new Eva
    dispatch(setExpandedEvaUuids([...expandedEvaUuids, blankEva.uuid]));
    // open right panel
    dispatch(setRightPanelOpen(true));
    // set selected tab
    dispatch(setSelectedEvaRightNavItem("info_panel"));
  };

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
              <IconButton
                onClick={() => {
                  handleCreateEva();
                }}
                label="Add EVA"
                icon={faPlusCircle}
              />
              <IconButton
                onClick={() => {
                  if (selectedEva) {
                    dispatch(duplicateEva(selectedEva));
                    dispatch(setRightPanelOpen(true));
                  }
                }}
                label="Duplicate EVA"
                icon={faClone}
                enabled={!_.isNull(selectedEva)}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default EvaPlannerLeft;
