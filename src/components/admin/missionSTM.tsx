import {
  Dispatch,
  FunctionComponent,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import adminStyles from "./admin.module.css";
import {
  getSTMLevel1s,
  getStmLevel2s,
  getSTMLevel3s,
  deleteSTMs,
  getSTMRules,
  upsertSTMs,
} from "http-client/stm";
import STMEdit from "components/admin/stmEdit";
import stmStyles from "./stmEdit.module.css";
import { faCaretDown, faCaretUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type AutomergeUrl, isValidAutomergeUrl } from "@automerge/automerge-repo";
import { getAutomergeDocListing } from "http-client/docListing";
import { useDocSelector } from "utils/useDocSelector";
import { deepEqual } from "utils/useAppSelector";

const MissionSTM: FunctionComponent<{
  missionId: number;
}> = ({ missionId }) => {
  const [allLevel1s, setAllLevel1s] = useState<STMLevel1[]>([]);
  const [allLevel2s, setAllLevel2s] = useState<STMLevel2[]>([]);
  const [allLevel3s, setAllLevel3s] = useState<STMLevel3[]>([]);
  const [automergeUrl, setAutomergeUrl] = useState<AutomergeUrl>();

  const loadSTMFromDB = useCallback(async (missionId: number) => {
    if (missionId) {
      //load level1s
      const level1s = await getSTMLevel1s({ missionId: missionId });
      if (level1s.data) {
        setAllLevel1s(level1s.data);
      }

      //load level2s
      const level2s = await getStmLevel2s({ missionId: missionId });
      if (level2s.data) {
        setAllLevel2s(level2s.data);
      }

      //load level3s
      const level3s = await getSTMLevel3s({ missionId: missionId });
      if (level3s.data) {
        setAllLevel3s(level3s.data);
      }
    }
  }, []);

  //delete a level 1, 2, or 3
  async function delSTM(
    uuid: string,
    stmType: "Level1" | "Level2" | "Level3",
    actionSystemVersion: number
  ) {
    if (confirm("Are you sure you want to delete " + stmType)) {
      // check if there are children for this STM item
      let alertMsg = "";
      if (stmType === "Level1") {
        if (allLevel2s.findIndex((level2) => level2.level1Uuid === uuid) >= 0) {
          alertMsg = "\nSTM has a level 2 child";
        }
      } else if (stmType === "Level2") {
        if (allLevel3s.findIndex((level3) => level3.level2Uuid === uuid) >= 0) {
          alertMsg = "\nSTM has a level 3 child";
        }
      }

      // check if any rules assigned to it
      if (actionSystemVersion === 2) {
        const res = await getSTMRules(missionId);
        if (res.data) {
          const rules = res.data;
          if (rules.findIndex((rule) => rule.stmUuid === uuid) >= 0) {
            alertMsg = "\nSTM has a rule assigned";
          }
        }
      }
      if (alertMsg.length > 0) {
        alert(`Cannot delete ${stmType}. ${alertMsg}`);
        return;
      }
      try {
        await deleteSTMs(missionId, stmType, [uuid]);
        await loadSTMFromDB(missionId);
      } catch {
        alert(`Unknown error deleting ${stmType}: ${uuid}`);
      }
    }
  }

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
    loadSTMFromDB(missionId);
  }, [missionId, getAutomerge, loadSTMFromDB]);

  return (
    <>
      {missionId && automergeUrl && (
        <div>
          <h2>STM for Mission: {missionId}</h2>
          <div className={adminStyles.sectionDiv}>
            <div className={adminStyles.sectionDivHeading}>Science Traceability Matrix</div>
            <Level1List
              level1s={allLevel1s}
              level2s={allLevel2s}
              level3s={allLevel3s}
              automergeUrl={automergeUrl}
              delSTM={delSTM}
            />
          </div>
          <div id="editSTM_div">
            <STMEdit
              missionId={missionId}
              automergeUrl={automergeUrl}
              allLevel1s={allLevel1s}
              allLevel2s={allLevel2s}
              allLevel3s={allLevel3s}
              reloadSTMfromDB={loadSTMFromDB}
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
  delSTM: (uuid: string, stmType: string, actionSystemVersion: number) => void;
  automergeUrl: AutomergeUrl;
}> = ({ level1s, level2s, level3s, delSTM, automergeUrl }) => {
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
        <ul>
          {level1s.map((objv: STMLevel1) => {
            return (
              <li key={objv.uuid}>
                <FontAwesomeIcon
                  icon={collapsedSTMLevel1s.includes(objv.uuid) ? faCaretUp : faCaretDown}
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
                    delSTM(objv.uuid, "Level1", partialMission.actionSystemVersion);
                  }}
                  saveFunction={async (stm) => {
                    const res = await upsertSTMs(partialMission.id, [stm] as STMLevel1[], "Level1");
                    if (res.status !== "success") {
                      alert(`${res.status} saving STM: ${res.message}`);
                    }
                  }}
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
  delSTM: (uuid: string, stmType: string, actionSystemVersion: number) => void;
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
}) => {
  if (level2s) {
    return (
      <ul>
        {level2s
          .filter((level2) => level2.level1Uuid === parentUuid)
          .map((level2: STMLevel2) => {
            return (
              <li key={level2.uuid}>
                <FontAwesomeIcon
                  icon={collapsedSTMLevel2s.includes(level2.uuid) ? faCaretUp : faCaretDown}
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
                    delSTM(level2.uuid, "Level2", actionSystemVersion);
                  }}
                  saveFunction={async (stm) => {
                    const res = await upsertSTMs(missionId, [stm] as STMLevel2[], "Level2");
                    if (res.status !== "success") {
                      alert(`${res.status} saving STM: ${res.message}`);
                    }
                  }}
                />
                {!collapsedSTMLevel2s.includes(level2.uuid) && (
                  <Level3List
                    parentUuid={level2.uuid}
                    level3s={level3s}
                    stmLevel3Name={stmLevel3Name}
                    actionSystemVersion={actionSystemVersion}
                    missionId={missionId}
                    delSTM={delSTM}
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
  delSTM: (uuid: string, stmType: string, actionSystemVersion: number) => void;
}> = ({ parentUuid, level3s, stmLevel3Name, actionSystemVersion, missionId, delSTM }) => {
  if (level3s) {
    return (
      <ul>
        {level3s
          .filter((level3) => level3.level2Uuid === parentUuid)
          .map((level3: STMLevel3) => {
            return (
              <li key={level3.uuid}>
                <STMUpdateFields
                  stm={level3}
                  stmLevelName={stmLevel3Name}
                  deleteFunction={() => {
                    delSTM(level3.uuid, "Level3", actionSystemVersion);
                  }}
                  saveFunction={async (stm) => {
                    const res = await upsertSTMs(missionId, [stm] as STMLevel3[], "Level3");
                    if (res.status !== "success") {
                      alert(`${res.status} saving STM: ${res.message}`);
                    }
                  }}
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
            onClick={() => {
              setIsEditing(false);
              saveFunction({ ...stm, numbering, name });
            }}
          >
            Save
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
        className={adminStyles.deleteButton}
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
