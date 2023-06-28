import { NextPage } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isLoggedIn } from "http-client/login";
import adminStyles from "components/admin/admin.module.css";
import { getObjectives, getGoals, getInvestigations, deleteSTM } from "http-client/stm";
import { getMissions } from "http-client/mission";
import STMEdit from "components/admin/stmEdit";

const STM: NextPage = () => {
  const router = useRouter();
  const [missionIdSlug, setMissionIdSlug] = useState<number>(null);
  const [message, setMessage] = useState("");
  const [missionName, setMissionName] = useState<string>("");

  //responses from the DB
  const [allObjectives, setAllObjectives] = useState<STMObjective[]>([]);
  const [allGoals, setAllGoals] = useState<STMGoal[]>([]);
  const [allInvestigations, setAllInvestigations] = useState<STMInvestigation[]>([]);

  async function loadSTMfromDB(missionId: number) {
    if (missionId) {
      //load objectives
      const objectives = await getObjectives({ missionId: missionId });
      if (objectives.data) {
        setAllObjectives(objectives.data);
      }

      //load goals
      const goals = await getGoals({ missionId: missionId });
      if (goals.data) {
        setAllGoals(goals.data);
      }

      //load investigations
      const investigations = await getInvestigations({ missionId: missionId });
      if (investigations.data) {
        setAllInvestigations(investigations.data);
      }
    }
  }

  //on load check login and mission id
  useEffect(() => {
    (async () => {
      const response = await isLoggedIn(); //check user is logged in
      if (response.status !== "success") {
        router.push("/"); //user is not logged in. Redirect to homepage
      }

      //set mission id state
      const { id } = router.query;
      if (id) {
        setMissionIdSlug(+id);
        setMessage("Loading mission ID " + id);

        //set mission name
        const mission = (await getMissions(+id)).data;
        if (mission) {
          setMissionName(mission[0].name);
        }
      } else {
        setMessage("No mission ID");
      }
    })();
  }, [router]);

  //realod db when mission id changes
  useEffect(() => {
    loadSTMfromDB(missionIdSlug);
  }, [missionIdSlug]);

  //delete an objective, goal, or investigation
  async function delSTM(uuid: string, stmType: "Objective" | "Goal" | "Investigation") {
    if (confirm("Are you sure you want to delete " + stmType)) {
      //check if there are children for this STM item
      let showAlert = false;
      if (stmType === "Objective") {
        if (allGoals.findIndex((goal) => goal.objectiveUuid === uuid) >= 0) {
          showAlert = true;
        }
      } else if (stmType === "Goal") {
        if (allInvestigations.findIndex((invstg) => invstg.goalUuid === uuid) >= 0) {
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
        await deleteSTM(missionIdSlug, stmType, uuid);
        await loadSTMfromDB(missionIdSlug);
        setMessage(`Delete Complete`);
      } catch {
        setMessage(`Unknown error deleting ${stmType}: ${uuid}`);
      }
    }
  }

  return (
    <div>
      Status: {message}
      <h2>Mission: {missionName}</h2>
      <button
        type="button"
        onClick={() => {
          router.push("/admin/");
        }}
      >
        Back to Mission
      </button>
      <h3>Science Tracability Matrix</h3>
      <ObjectiveList
        objectives={allObjectives}
        goals={allGoals}
        investigations={allInvestigations}
        delSTM={delSTM}
      />
      <div id="editSTM_div">
        <h3>Add/Delete STM</h3>
        <STMEdit
          missionId={missionIdSlug}
          allObjectives={allObjectives}
          allGoals={allGoals}
          allInvestigations={allInvestigations}
          reloadSTMfromDB={loadSTMfromDB}
        />
      </div>
    </div>
  );
};

/*********************************/
/** STM DISPLAY LIST COMPONENTS **/
/*********************************/

//Objective list component
const ObjectiveList = (props: {
  objectives: STMObjective[];
  goals: STMGoal[];
  investigations: STMInvestigation[];
  delSTM: (uuid: string, stmType: string) => void;
}) => {
  if (props.objectives.length > 0) {
    return (
      <ul>
        {props.objectives.map((objv: STMObjective) => {
          return (
            <li key={objv.uuid}>
              Objective {objv.numbering}: {objv.name}
              <button
                className={adminStyles.deleteButton}
                type="button"
                onClick={() => {
                  props.delSTM(objv.uuid, "Objective");
                }}
              >
                Delete Objective
              </button>
              <GoalList
                parentNumbering={objv.numbering}
                parentuuid={objv.uuid}
                goals={props.goals}
                investigations={props.investigations}
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

//Goal list component
const GoalList = (props: {
  parentuuid: string;
  parentNumbering: string;
  goals: STMGoal[];
  investigations: STMInvestigation[];
  delSTM: (uuid: string, stmType: string) => void;
}) => {
  if (props.goals) {
    return (
      <ul>
        {props.goals
          .filter((goal) => goal.objectiveUuid === props.parentuuid)
          .map((goal: STMGoal) => {
            const goalNumbering = `${props.parentNumbering}${goal.numbering}`;
            return (
              <li key={goal.uuid}>
                Goal {goalNumbering}: {goal.name}
                <button
                  className={adminStyles.deleteButton}
                  type="button"
                  onClick={() => {
                    props.delSTM(goal.uuid, "Goal");
                  }}
                >
                  Delete Goal
                </button>
                <InvestigationList
                  parentNumbering={goalNumbering}
                  parentuuid={goal.uuid}
                  investigations={props.investigations}
                  delSTM={props.delSTM}
                />
              </li>
            );
          })}
      </ul>
    );
  }
};

//Investigation list component.
const InvestigationList = (props: {
  parentuuid: string;
  parentNumbering: string;
  investigations: STMInvestigation[];
  delSTM: (uuid: string, stmType: string) => void;
}) => {
  if (props.investigations) {
    return (
      <ul>
        {props.investigations
          .filter((invstg) => invstg.goalUuid === props.parentuuid)
          .map((invstg: STMInvestigation) => {
            return (
              <li key={invstg.uuid}>
                Investigation {`${props.parentNumbering}-${invstg.numbering}`}: {invstg.name}
                <button
                  className={adminStyles.deleteButton}
                  type="button"
                  onClick={() => {
                    props.delSTM(invstg.uuid, "Investigation");
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

export default STM;
