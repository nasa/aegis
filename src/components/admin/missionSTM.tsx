import type { Dispatch, FunctionComponent, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import adminStyles from "./admin.module.css";
import adminCommon from "pages/admin/adminCommon.module.css";
import STMEdit from "components/admin/stmEdit";
import stmStyles from "./stmEdit.module.css";
import { faCaretDown, faCaretRight, faFloppyDisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type AutomergeUrl, isValidAutomergeUrl } from "@automerge/automerge-repo";
import { getAutomergeDocListing } from "http-client/docListing";
import { useDocSelector } from "utils/useDocSelector";
import { deepEqual } from "utils/useAppSelector";
import { useDocHandle } from "@automerge/automerge-repo-react-hooks";
import { selectStmLevel1s, selectStmLevel2s, selectStmLevel3s } from "store/selectors";
import {
  applyDeleteStmLevel,
  applyUpdateStmLevelByField,
  getStmLevelDeleteBlocker,
} from "operations/apply/apply-mission-stm";

const STM_COLLECTION_BY_TYPE = {
  Level1: "stmLevel1s",
  Level2: "stmLevel2s",
  Level3: "stmLevel3s",
} as const;

const MissionSTM: FunctionComponent<{
  missionId: number;
}> = ({ missionId }) => {
  const [automergeUrl, setAutomergeUrl] = useState<AutomergeUrl>();
  const missionDocHandle = useDocHandle<Mission>(automergeUrl);
  const stmTree = useDocSelector<
    Mission,
    { level1s: STMLevel1[]; level2s: STMLevel2[]; level3s: STMLevel3[] }
  >(
    automergeUrl,
    (doc) => ({
      level1s: selectStmLevel1s(doc),
      level2s: selectStmLevel2s(doc),
      level3s: selectStmLevel3s(doc),
    }),
    deepEqual
  );
  const allLevel1s = stmTree?.level1s ?? [];
  const allLevel2s = stmTree?.level2s ?? [];
  const allLevel3s = stmTree?.level3s ?? [];

  // This admin page loads its own mission doc handle, so it writes to it directly
  const changeMission = useCallback(
    (updateFn: (m: Mission) => void) => {
      // eslint-disable-next-line no-restricted-syntax
      missionDocHandle?.change((m: Mission) => {
        updateFn(m);
        m.updatedAt = new Date().getTime();
      });
    },
    [missionDocHandle]
  );

  //delete a level 1, 2, or 3
  function delSTM(uuid: string, stmType: "Level1" | "Level2" | "Level3") {
    if (!confirm("Are you sure you want to delete " + stmType)) return;
    const collection = STM_COLLECTION_BY_TYPE[stmType];
    const blocker = getStmLevelDeleteBlocker(missionDocHandle.doc(), { collection, uuid });
    if (blocker) {
      alert(`Cannot delete ${stmType}. 
${blocker}`);
      return;
    }
    changeMission((m) => applyDeleteStmLevel(m, { collection, uuid }));
  }

  const saveSTM = (
    stmType: "Level1" | "Level2" | "Level3",
    stm: STMLevel1 | STMLevel2 | STMLevel3
  ) => {
    const collection = STM_COLLECTION_BY_TYPE[stmType];
    changeMission((m) => {
      applyUpdateStmLevelByField(m, {
        collection,
        uuid: stm.uuid,
        fieldName: "name",
        value: stm.name,
      });
      applyUpdateStmLevelByField(m, {
        collection,
        uuid: stm.uuid,
        fieldName: "numbering",
        value: stm.numbering,
      });
    });
  };

  // get the automerge URL from the automerge records db
  const getAutomerge = useCallback(async () => {
    if (!missionId) return;
    const res = await getAutomergeDocListing(missionId);
    if (isValidAutomergeUrl(res.data[0].automergeUrl)) {
      setAutomergeUrl(res.data[0].automergeUrl);
    }
  }, [missionId]);

  useEffect(() => {
    if (!missionId) return;
    getAutomerge();
  }, [missionId, getAutomerge]);

  return (
    <>
      {missionId && automergeUrl && (
        <div>
          <div className={adminStyles.sectionDiv}>
            <div className={adminStyles.sectionDivHeading}>Science Traceability Matrix</div>
            <Level1List
              level1s={allLevel1s}
              level2s={allLevel2s}
              level3s={allLevel3s}
              automergeUrl={automergeUrl}
              delSTM={delSTM}
              saveSTM={saveSTM}
            />
          </div>
          <div id="editSTM_div">
            <STMEdit
              missionId={missionId}
              automergeUrl={automergeUrl}
              allLevel1s={allLevel1s}
              allLevel2s={allLevel2s}
              allLevel3s={allLevel3s}
              changeMission={changeMission}
            />
          </div>
        </div>
      )}
    </>
  );
};

/*********************************/
/** STM DISPLAY LIST COMPONENTS **/
/*********************************/

//Level1 list component
const Level1List: FunctionComponent<{
  level1s: STMLevel1[];
  level2s: STMLevel2[];
  level3s: STMLevel3[];
  delSTM: (uuid: string, stmType: "Level1" | "Level2" | "Level3") => void;
  saveSTM: (
    stmType: "Level1" | "Level2" | "Level3",
    stm: STMLevel1 | STMLevel2 | STMLevel3
  ) => void;
  automergeUrl: AutomergeUrl;
}> = ({ level1s, level2s, level3s, delSTM, saveSTM, automergeUrl }) => {
  const [collapsedSTMLevel1s, setCollapsedSTMLevel1s] = useState<string[]>([]);
  const [collapsedSTMLevel2s, setCollapsedSTMLevel2s] = useState<string[]>([]);

  const partialMission = useDocSelector<
    Mission,
    {
      id: number;
      stmLevel1Name: string;
      stmLevel1Enabled: boolean;
      stmLevel2Name: string;
      stmLevel3Name: string;
      actionSystemVersion: number;
    }
  >(
    automergeUrl,
    (doc) => ({
      id: doc.id,
      stmLevel1Name: doc.stmLevel1Name,
      stmLevel1Enabled: doc.stmLevel1Enabled,
      stmLevel2Name: doc.stmLevel2Name,
      stmLevel3Name: doc.stmLevel3Name,
      actionSystemVersion: doc.actionSystemVersion,
    }),
    deepEqual
  );

  if (level1s.length > 0) {
    return (
      partialMission && (
        <ul style={{ paddingLeft: "1.2rem", margin: 0 }}>
          {level1s.map((objv: STMLevel1) => {
            return (
              <li key={objv.uuid} style={{ margin: "6px 0" }}>
                <FontAwesomeIcon
                  icon={collapsedSTMLevel1s.includes(objv.uuid) ? faCaretRight : faCaretDown}
                  onClick={() => {
                    if (!collapsedSTMLevel1s.includes(objv.uuid)) {
                      const newCollapsed = [...collapsedSTMLevel1s];
                      newCollapsed.push(objv.uuid);
                      setCollapsedSTMLevel1s(newCollapsed);
                    } else {
                      setCollapsedSTMLevel1s(
                        collapsedSTMLevel1s.filter((uuid) => uuid !== objv.uuid)
                      );
                    }
                  }}
                  className={adminStyles.collapsable}
                />
                &nbsp;
                <STMUpdateFields
                  stm={objv}
                  stmLevelName={partialMission.stmLevel1Name}
                  disabled={!partialMission.stmLevel1Enabled}
                  deleteFunction={() => {
                    delSTM(objv.uuid, "Level1");
                  }}
                  saveFunction={(stm) => saveSTM("Level1", stm)}
                />
                {!collapsedSTMLevel1s.includes(objv.uuid) && (
                  <Level2List
                    missionId={partialMission.id}
                    parentUuid={objv.uuid}
                    level2s={level2s}
                    level3s={level3s}
                    stmLevel2Name={partialMission.stmLevel2Name}
                    stmLevel3Name={partialMission.stmLevel3Name}
                    actionSystemVersion={partialMission.actionSystemVersion}
                    collapsedSTMLevel2s={collapsedSTMLevel2s}
                    setCollapsedSTMLevel2s={setCollapsedSTMLevel2s}
                    delSTM={delSTM}
                    saveSTM={saveSTM}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )
    );
  } else {
    return <div>No STM found</div>;
  }
};

//Level2 list component
const Level2List: FunctionComponent<{
  missionId: number;
  parentUuid: string;
  level2s: STMLevel2[];
  level3s: STMLevel3[];
  stmLevel2Name: string;
  stmLevel3Name: string;
  actionSystemVersion: number;
  collapsedSTMLevel2s: string[];
  setCollapsedSTMLevel2s: Dispatch<SetStateAction<string[]>>;
  delSTM: (uuid: string, stmType: "Level1" | "Level2" | "Level3") => void;
  saveSTM: (
    stmType: "Level1" | "Level2" | "Level3",
    stm: STMLevel1 | STMLevel2 | STMLevel3
  ) => void;
}> = ({
  missionId,
  parentUuid,
  level2s,
  level3s,
  stmLevel2Name,
  stmLevel3Name,
  actionSystemVersion,
  collapsedSTMLevel2s,
  setCollapsedSTMLevel2s,
  delSTM,
  saveSTM,
}) => {
  if (level2s) {
    return (
      <ul style={{ paddingLeft: "1.2rem", margin: "4px 0" }}>
        {level2s
          .filter((level2) => level2.level1Uuid === parentUuid)
          .map((level2: STMLevel2) => {
            return (
              <li key={level2.uuid} style={{ margin: "6px 0" }}>
                <FontAwesomeIcon
                  icon={collapsedSTMLevel2s.includes(level2.uuid) ? faCaretRight : faCaretDown}
                  onClick={() => {
                    if (!collapsedSTMLevel2s.includes(level2.uuid)) {
                      const newCollapsed = [...collapsedSTMLevel2s];
                      newCollapsed.push(level2.uuid);
                      setCollapsedSTMLevel2s(newCollapsed);
                    } else {
                      setCollapsedSTMLevel2s(
                        collapsedSTMLevel2s.filter((uuid) => uuid !== level2.uuid)
                      );
                    }
                  }}
                  className={adminStyles.collapsable}
                />
                &nbsp;
                <STMUpdateFields
                  stm={level2}
                  stmLevelName={stmLevel2Name}
                  deleteFunction={() => {
                    delSTM(level2.uuid, "Level2");
                  }}
                  saveFunction={(stm) => saveSTM("Level2", stm)}
                />
                {!collapsedSTMLevel2s.includes(level2.uuid) && (
                  <Level3List
                    parentUuid={level2.uuid}
                    level3s={level3s}
                    stmLevel3Name={stmLevel3Name}
                    actionSystemVersion={actionSystemVersion}
                    missionId={missionId}
                    delSTM={delSTM}
                    saveSTM={saveSTM}
                  />
                )}
              </li>
            );
          })}
      </ul>
    );
  }
};

//Level3 list component.
const Level3List: FunctionComponent<{
  parentUuid: string;
  level3s: STMLevel3[];
  stmLevel3Name: string;
  actionSystemVersion: number;
  missionId: number;
  delSTM: (uuid: string, stmType: "Level1" | "Level2" | "Level3") => void;
  saveSTM: (
    stmType: "Level1" | "Level2" | "Level3",
    stm: STMLevel1 | STMLevel2 | STMLevel3
  ) => void;
}> = ({ parentUuid, level3s, stmLevel3Name, delSTM, saveSTM }) => {
  if (level3s) {
    return (
      <ul style={{ paddingLeft: "1.2rem", margin: "4px 0" }}>
        {level3s
          .filter((level3) => level3.level2Uuid === parentUuid)
          .map((level3: STMLevel3) => {
            return (
              <li key={level3.uuid} style={{ margin: "6px 0" }}>
                <STMUpdateFields
                  stm={level3}
                  stmLevelName={stmLevel3Name}
                  deleteFunction={() => {
                    delSTM(level3.uuid, "Level3");
                  }}
                  saveFunction={(stm) => saveSTM("Level3", stm)}
                />
              </li>
            );
          })}
      </ul>
    );
  }
};

const STMUpdateFields: FunctionComponent<{
  stm: STMLevel1 | STMLevel2 | STMLevel3;
  stmLevelName: string;
  disabled?: boolean;
  deleteFunction: () => void;
  saveFunction: (stm: STMLevel1 | STMLevel2 | STMLevel3) => void;
}> = ({ stm, stmLevelName, disabled = false, deleteFunction, saveFunction }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [numbering, setNumbering] = useState(stm.numbering);
  const [name, setName] = useState(stm.name);

  return (
    <>
      {isEditing ? (
        <>
          <label htmlFor="editLevel1Numbering">Number/Letter</label>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          <input
            id="editLevel1Numbering"
            type="text"
            onChange={(e) => {
              setNumbering(e.target.value);
            }}
            value={numbering}
            className={stmStyles.numberingField}
          />
          &nbsp;
          <label htmlFor="editLevel1Name">Name</label>&nbsp;
          <input
            id="editLevel1Name"
            type="text"
            onChange={(e) => {
              setName(e.target.value);
            }}
            value={name}
            className={stmStyles.nameField}
          />
          &nbsp;
          <button
            type="button"
            className={adminCommon.button}
            onClick={() => {
              setIsEditing(false);
              saveFunction({ ...stm, numbering, name });
            }}
          >
            <FontAwesomeIcon icon={faFloppyDisk} /> Save
          </button>
        </>
      ) : (
        <>
          <span style={{ textDecoration: disabled ? "line-through" : "none" }}>
            {stmLevelName} {numbering}: {name}
          </span>
          &nbsp;
          <button
            type="button"
            className={adminCommon.button}
            onClick={() => {
              setIsEditing(true);
            }}
            disabled={disabled}
          >
            Edit
          </button>
        </>
      )}
      &nbsp;
      <button
        className={adminCommon.buttonDanger}
        type="button"
        onClick={() => {
          deleteFunction();
        }}
      >
        Delete
      </button>
    </>
  );
};
export default MissionSTM;
