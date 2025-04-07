import { Dispatch, FunctionComponent, SetStateAction, useEffect, useState } from "react";
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

const MissionSTM: FunctionComponent<{
  mission: Mission;
  setMission: Dispatch<SetStateAction<Mission>>;
}> = ({ mission, setMission }) => {
  //responses from the DB
  const [allLevel1s, setAllLevel1s] = useState<STMLevel1[]>([]);
  const [allLevel2s, setAllLevel2s] = useState<STMLevel2[]>([]);
  const [allLevel3s, setAllLevel3s] = useState<STMLevel3[]>([]);

  async function loadSTMfromDB(missionId: number) {
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
  }
  // put loadSTMfromDB in a useEffect to handle the side effect of updating state
  useEffect(() => {
    loadSTMfromDB(mission.id);
  }, [mission.id]);

  //delete a level 1, 2, or 3
  async function delSTM(uuid: string, stmType: "Level1" | "Level2" | "Level3") {
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
      if (mission.actionSystemVersion === 2) {
        const res = await getSTMRules(mission.id);
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
        await deleteSTMs(mission.id, stmType, [uuid]);
        await loadSTMfromDB(mission.id);
      } catch {
        alert(`Unknown error deleting ${stmType}: ${uuid}`);
      }
    }
  }

  return (
    <>
      {mission && (
        <div>
          <h2>STM for Mission: {mission.name}</h2>
          <div className={adminStyles.sectionDiv}>
            <div className={adminStyles.sectionDivHeading}>Science Tracability Matrix</div>
            <Level1List
              level1s={allLevel1s}
              level2s={allLevel2s}
              level3s={allLevel3s}
              mission={mission}
              delSTM={delSTM}
            />
          </div>
          <div id="editSTM_div">
            <STMEdit
              missionId={mission.id}
              allLevel1s={allLevel1s}
              allLevel2s={allLevel2s}
              allLevel3s={allLevel3s}
              reloadSTMfromDB={loadSTMfromDB}
              mission={mission}
              setMission={setMission}
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
  mission: Mission;
  delSTM: (uuid: string, stmType: string) => void;
}> = ({ level1s, level2s, level3s, mission, delSTM }) => {
  const [collapsedSTMLevel1s, setCollapsedSTMLevel1s] = useState<string[]>([]);
  const [collapsedSTMLevel2s, setCollapsedSTMLevel2s] = useState<string[]>([]);

  if (level1s.length > 0) {
    return (
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
                stmLevelName={mission.stmLevel1Name}
                disabled={!mission.stmLevel1Enabled}
                deleteFunction={() => {
                  delSTM(objv.uuid, "Level1");
                }}
                saveFunction={async (stm) => {
                  const res = await upsertSTMs(mission.id, [stm] as STMLevel1[], "Level1");
                  if (res.status !== "success") {
                    alert(`${res.status} saving STM: ${res.message}`);
                  }
                }}
              />
              {!collapsedSTMLevel1s.includes(objv.uuid) && (
                <Level2List
                  parentuuid={objv.uuid}
                  level2s={level2s}
                  level3s={level3s}
                  mission={mission}
                  collapsedSTMLevel2s={collapsedSTMLevel2s}
                  setCollapsedSTMLevel2s={setCollapsedSTMLevel2s}
                  delSTM={delSTM}
                />
              )}
            </li>
          );
        })}
      </ul>
    );
  } else {
    return <div>No STM found</div>;
  }
};

//Level2 list component
const Level2List: FunctionComponent<{
  parentuuid: string;
  level2s: STMLevel2[];
  level3s: STMLevel3[];
  mission: Mission;
  collapsedSTMLevel2s: string[];
  setCollapsedSTMLevel2s: Dispatch<SetStateAction<string[]>>;
  delSTM: (uuid: string, stmType: string) => void;
}> = ({
  parentuuid,
  level2s,
  level3s,
  mission,
  collapsedSTMLevel2s,
  setCollapsedSTMLevel2s,
  delSTM,
}) => {
  if (level2s) {
    return (
      <ul>
        {level2s
          .filter((level2) => level2.level1Uuid === parentuuid)
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
                  stmLevelName={mission.stmLevel2Name}
                  deleteFunction={() => {
                    delSTM(level2.uuid, "Level2");
                  }}
                  saveFunction={async (stm) => {
                    const res = await upsertSTMs(mission.id, [stm] as STMLevel2[], "Level2");
                    if (res.status !== "success") {
                      alert(`${res.status} saving STM: ${res.message}`);
                    }
                  }}
                />
                {!collapsedSTMLevel2s.includes(level2.uuid) && (
                  <Level3List
                    parentuuid={level2.uuid}
                    level3s={level3s}
                    mission={mission}
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
  parentuuid: string;
  level3s: STMLevel3[];
  mission: Mission;
  delSTM: (uuid: string, stmType: string) => void;
}> = ({ parentuuid, level3s, mission, delSTM }) => {
  if (level3s) {
    return (
      <ul>
        {level3s
          .filter((level3) => level3.level2Uuid === parentuuid)
          .map((level3: STMLevel3) => {
            return (
              <li key={level3.uuid}>
                <STMUpdateFields
                  stm={level3}
                  stmLevelName={mission.stmLevel3Name}
                  deleteFunction={() => {
                    delSTM(level3.uuid, "Level3");
                  }}
                  saveFunction={async (stm) => {
                    const res = await upsertSTMs(mission.id, [stm] as STMLevel3[], "Level3");
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
