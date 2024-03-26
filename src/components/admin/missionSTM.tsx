import { FunctionComponent, useEffect, useState } from "react";
import adminStyles from "./admin.module.css";
import { getSTMLevel1s, getStmLevel2s, getSTMLevel3s, deleteSTMs } from "http-client/stm";
import STMEdit from "components/admin/stmEdit";

const MissionSTM: FunctionComponent<{ mission: Mission }> = (props: { mission: Mission }) => {
  const [missionIdSlug, setMissionIdSlug] = useState<number>(null);
  const [message, setMessage] = useState("");

  //responses from the DB
  const [allLevel1s, setAllLevel1s] = useState<STMLevel1[]>([]);
  const [allLevel2s, setAllLevel2s] = useState<STMLevel2[]>([]);
  const [allLevel3s, setAllLevel3s] = useState<STMLevel3[]>([]);

  const mission = props.mission;

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

  useEffect(() => {
    if (!mission) return;

    setMissionIdSlug(mission.id);
  }, [mission]);

  //realod db when mission id changes
  useEffect(() => {
    loadSTMfromDB(missionIdSlug);
  }, [missionIdSlug]);

  //delete a level 1, 2, or 3
  async function delSTM(uuid: string, stmType: "Level1" | "Level2" | "Level3") {
    if (confirm("Are you sure you want to delete " + stmType)) {
      //check if there are children for this STM item
      let showAlert = false;
      if (stmType === "Level1") {
        if (allLevel2s.findIndex((level2) => level2.level1Uuid === uuid) >= 0) {
          showAlert = true;
        }
      } else if (stmType === "Level2") {
        if (allLevel3s.findIndex((level3) => level3.level2Uuid === uuid) >= 0) {
          showAlert = true;
        }
      }
      if (showAlert) {
        alert(
          `Cannot delete ${stmType} because it has children. Delete all the children first, then delete this ${stmType}.`
        );
        return;
      }
      try {
        setMessage(`Deleting ${stmType}: ${uuid}`);
        await deleteSTMs(missionIdSlug, stmType, [uuid]);
        await loadSTMfromDB(missionIdSlug);
        setMessage(`Delete Complete`);
      } catch {
        setMessage(`Unknown error deleting ${stmType}: ${uuid}`);
      }
    }
  }

  return (
    <>
      {mission && (
        <div>
          <h2>Mission: {mission.name}</h2>
          Status: {message}
          <h3>Science Tracability Matrix</h3>
          <Level1List
            level1s={allLevel1s}
            level2s={allLevel2s}
            level3s={allLevel3s}
            delSTM={delSTM}
          />
          <div id="editSTM_div">
            <h3>Add/Delete STM</h3>
            <STMEdit
              missionId={missionIdSlug}
              allLevel1s={allLevel1s}
              allLevel2s={allLevel2s}
              allLevel3s={allLevel3s}
              reloadSTMfromDB={loadSTMfromDB}
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
const Level1List = (props: {
  level1s: STMLevel1[];
  level2s: STMLevel2[];
  level3s: STMLevel3[];
  delSTM: (uuid: string, stmType: string) => void;
}) => {
  if (props.level1s.length > 0) {
    return (
      <ul>
        {props.level1s.map((objv: STMLevel1) => {
          return (
            <li key={objv.uuid}>
              Goal {objv.numbering}: {objv.name}
              <button
                className={adminStyles.deleteButton}
                type="button"
                onClick={() => {
                  props.delSTM(objv.uuid, "Level1");
                }}
              >
                Delete Goal
              </button>
              <Level2List
                parentNumbering={objv.numbering}
                parentuuid={objv.uuid}
                level2s={props.level2s}
                level3s={props.level3s}
                delSTM={props.delSTM}
              />
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
const Level2List = (props: {
  parentuuid: string;
  parentNumbering: string;
  level2s: STMLevel2[];
  level3s: STMLevel3[];
  delSTM: (uuid: string, stmType: string) => void;
}) => {
  if (props.level2s) {
    return (
      <ul>
        {props.level2s
          .filter((level2) => level2.level1Uuid === props.parentuuid)
          .map((level2: STMLevel2) => {
            const level2Numbering = `${props.parentNumbering}${level2.numbering}`;
            return (
              <li key={level2.uuid}>
                Objective {level2Numbering}: {level2.name}
                <button
                  className={adminStyles.deleteButton}
                  type="button"
                  onClick={() => {
                    props.delSTM(level2.uuid, "Level2");
                  }}
                >
                  Delete Objective
                </button>
                <Level3List
                  parentNumbering={level2Numbering}
                  parentuuid={level2.uuid}
                  level3s={props.level3s}
                  delSTM={props.delSTM}
                />
              </li>
            );
          })}
      </ul>
    );
  }
};

//Level3 list component.
const Level3List = (props: {
  parentuuid: string;
  parentNumbering: string;
  level3s: STMLevel3[];
  delSTM: (uuid: string, stmType: string) => void;
}) => {
  if (props.level3s) {
    return (
      <ul>
        {props.level3s
          .filter((level3) => level3.level2Uuid === props.parentuuid)
          .map((level3: STMLevel3) => {
            return (
              <li key={level3.uuid}>
                Investigation {`${props.parentNumbering}-${level3.numbering}`}: {level3.name}
                <button
                  className={adminStyles.deleteButton}
                  type="button"
                  onClick={() => {
                    props.delSTM(level3.uuid, "Level3");
                  }}
                >
                  Delete Investigation
                </button>
              </li>
            );
          })}
      </ul>
    );
  }
};

export default MissionSTM;
