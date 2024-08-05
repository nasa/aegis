import { Dispatch, FunctionComponent, SetStateAction, useEffect, useState } from "react";
import adminStyles from "./admin.module.css";
import { getSTMLevel1s, getStmLevel2s, getSTMLevel3s, deleteSTMs } from "http-client/stm";
import STMEdit from "components/admin/stmEdit";

const MissionSTM: FunctionComponent<{
  mission: Mission;
  setMission: Dispatch<SetStateAction<Mission>>;
}> = ({ mission, setMission }) => {
  const [missionIdSlug, setMissionIdSlug] = useState<number>(null);
  const [message, setMessage] = useState("");

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
          <h2>STM for Mission: {mission.name}</h2>
          Status: {message}
          <div className={adminStyles.sectionDiv}>
            <div className={adminStyles.sectionDivHeading}>Science Tracability Matrix</div>
            <Level1List
              level1s={allLevel1s}
              level2s={allLevel2s}
              level3s={allLevel3s}
              delSTM={delSTM}
              mission={mission}
            />
          </div>
          <div id="editSTM_div">
            <STMEdit
              missionId={missionIdSlug}
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
  delSTM: (uuid: string, stmType: string) => void;
  mission: Mission;
}> = ({ level1s, level2s, level3s, delSTM, mission }) => {
  if (level1s.length > 0) {
    return (
      <ul>
        {level1s.map((objv: STMLevel1) => {
          return (
            <li key={objv.uuid}>
              <span style={{ textDecoration: mission.stmLevel1Enabled ? "none" : "line-through" }}>
                {mission.stmLevel1Name} {objv.numbering}: {objv.name}
              </span>
              <button
                className={adminStyles.deleteButton}
                type="button"
                onClick={() => {
                  delSTM(objv.uuid, "Level1");
                }}
              >
                Delete Level 1
              </button>
              <Level2List
                parentNumbering={objv.numbering}
                parentuuid={objv.uuid}
                level2s={level2s}
                level3s={level3s}
                delSTM={delSTM}
                mission={mission}
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
const Level2List: FunctionComponent<{
  parentuuid: string;
  parentNumbering: string;
  level2s: STMLevel2[];
  level3s: STMLevel3[];
  delSTM: (uuid: string, stmType: string) => void;
  mission: Mission;
}> = ({ parentuuid, parentNumbering, level2s, level3s, delSTM, mission }) => {
  if (level2s) {
    return (
      <ul>
        {level2s
          .filter((level2) => level2.level1Uuid === parentuuid)
          .map((level2: STMLevel2) => {
            const level2Numbering = mission.stmLevel1Enabled
              ? `${parentNumbering}${level2.numbering}`
              : `${level2.numbering}`;
            return (
              <li key={level2.uuid}>
                {mission.stmLevel2Name} {level2Numbering}: {level2.name}
                <button
                  className={adminStyles.deleteButton}
                  type="button"
                  onClick={() => {
                    delSTM(level2.uuid, "Level2");
                  }}
                >
                  Delete Level 2
                </button>
                <Level3List
                  parentNumbering={level2Numbering}
                  parentuuid={level2.uuid}
                  level3s={level3s}
                  delSTM={delSTM}
                  mission={mission}
                />
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
  parentNumbering: string;
  level3s: STMLevel3[];
  delSTM: (uuid: string, stmType: string) => void;
  mission: Mission;
}> = ({ parentuuid, parentNumbering, level3s, delSTM, mission }) => {
  if (level3s) {
    return (
      <ul>
        {level3s
          .filter((level3) => level3.level2Uuid === parentuuid)
          .map((level3: STMLevel3) => {
            return (
              <li key={level3.uuid}>
                {mission.stmLevel3Name} {`${parentNumbering}-${level3.numbering}`}: {level3.name}
                <button
                  className={adminStyles.deleteButton}
                  type="button"
                  onClick={() => {
                    delSTM(level3.uuid, "Level3");
                  }}
                >
                  Delete Level 3
                </button>
              </li>
            );
          })}
      </ul>
    );
  }
};

export default MissionSTM;
