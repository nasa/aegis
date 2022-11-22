import { NextPage } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isLoggedIn } from "http-client/internal-api";
import { v4 as uuidv4 } from "uuid";
import styles from "./stm.module.css";
import { getObjectives, getGoals, getInvestigations, deleteSTM, upsertSTM } from "http-client/stm";

const STM: NextPage = () => {
  const router = useRouter();
  const [missionIdSlug, setMissionIdSlug] = useState<number>(null);
  const [message, setMessage] = useState("");

  //track states of selected STM items in the drop downs
  const [selectedObjUUID, setSelectedObjUUID] = useState("0");
  const [selectedGoalUUID, setSelectedGoalUUID] = useState("0");

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
    //check if there are children for this STM item
    let showAlert = false;
    if (stmType === "Objective") {
      if (allGoals.findIndex((goal) => goal.objective === uuid) >= 0) {
        showAlert = true;
      }
    } else if (stmType === "Goal") {
      if (allInvestigations.findIndex((invstg) => invstg.goal === uuid) >= 0) {
        showAlert = true;
      }
    }
    if (showAlert) {
      alert(
        `Cannot delete ${stmType} becuase it has children. Delete all the children first, then delete this ${stmType}.`
      );
      return;
    }
    try {
      setMessage(`Deleting ${stmType}: ${uuid}`);
      await deleteSTM(missionIdSlug, uuid, stmType);
      loadSTMfromDB(missionIdSlug);
      setMessage(`Delete Complete`);
    } catch {
      setMessage(`Unknown error deleting ${stmType}: ${uuid}`);
    }
  }

  return (
    <div>
      Status: {message}
      <h3>Science Tracability Matrix</h3>
      <ObjectiveList
        objectives={allObjectives}
        goals={allGoals}
        investigations={allInvestigations}
      />
      <h3>Add/Delete STM</h3>
      <div>
        <div className={styles.div_select}></div>
        <div id="div_addObjective" className={styles.div_add}>
          <NewObjectiveFields missionId={missionIdSlug} reloadSTM={loadSTMfromDB} />
        </div>
      </div>
      <div>
        <div id="div_selectObjective" className={styles.div_select}>
          <ObjectiveSelect
            objectives={allObjectives}
            setSelectedObjUUID={setSelectedObjUUID}
            delSTM={delSTM}
          />
        </div>
        <div id="div_addGoal" className={styles.div_add}>
          <NewGoalFields
            objectiveUUID={selectedObjUUID}
            missionId={missionIdSlug}
            reloadSTM={loadSTMfromDB}
          />
        </div>
      </div>
      <div>
        <div id="div_selectGoal" className={styles.div_select}>
          <GoalSelect
            allGoals={allGoals}
            objectiveUUID={selectedObjUUID}
            setSelectedGoalUUID={setSelectedGoalUUID}
            delSTM={delSTM}
          />
        </div>
        <div id="div_addInvestigation" className={styles.div_add}>
          <NewInvstgFields
            goalUUID={selectedGoalUUID}
            missionId={missionIdSlug}
            reloadSTM={loadSTMfromDB}
          />
        </div>
      </div>
      <div>
        <div id="div_selectInvestigation" className={styles.div_select}>
          <InvestigationSelect
            allInvestigations={allInvestigations}
            goalUUID={selectedGoalUUID}
            delSTM={delSTM}
          />
        </div>
      </div>
      *STM items can only be deleted if they have no children
    </div>
  );
};

/*****************************/
/** ADD/EDIT STM COMPONENTS **/
/*****************************/

//Objective select component.
const ObjectiveSelect = (props: {
  objectives: STMObjective[];
  setSelectedObjUUID: (uuid: string) => void;
  delSTM: (uuid: string, stmType: string) => void;
}) => {
  const [selectedUUID, setSelectedUUID] = useState("0");
  const [disableDelete, setDisableDelete] = useState(true);

  const parentSelectUUID = props.setSelectedObjUUID;

  //set default selected uuid
  useEffect(() => {
    if (props.objectives?.length > 0) {
      setSelectedUUID(props.objectives[0].uuid);
      setDisableDelete(false);
    } else {
      setDisableDelete(true);
    }
  }, [props.objectives]);

  //propagate selected uuid up to the parent component
  useEffect(() => {
    parentSelectUUID(selectedUUID);
  }, [selectedUUID, parentSelectUUID]);

  return (
    <>
      <label htmlFor="objSelect" className={styles.selectLabel}>
        Select Objective
      </label>
      <select
        id="objSelect"
        onChange={(e) => setSelectedUUID(e.target.value)}
        value={selectedUUID}
        className={styles.selectField}
      >
        {props.objectives.map((obj: STMObjective) => {
          return (
            <option key={obj.uuid} value={obj.uuid}>
              {`${obj.numbering}: ${obj.name}`}
            </option>
          );
        })}
      </select>
      &nbsp;
      <button
        type="button"
        onClick={() => {
          props.delSTM(selectedUUID, "Objective");
        }}
        disabled={disableDelete}
      >
        Delete Objective
      </button>
    </>
  );
};

//Goal select component
const GoalSelect = (props: {
  allGoals: STMGoal[];
  objectiveUUID: string;
  setSelectedGoalUUID: (uuid: string) => void;
  delSTM: (uuid: string, stmType: string) => void;
}) => {
  const [filteredGoals, setFilteredGoals] = useState<STMGoal[]>([]);
  const [selectedUUID, setSelectedUUID] = useState("0");
  const [disableDelete, setDisableDelete] = useState(true);

  const parentSelectUUID = props.setSelectedGoalUUID;

  //filter down goals
  useEffect(() => {
    const goals = props.allGoals.filter((goal) => {
      return goal.objective === props.objectiveUUID;
    });
    setFilteredGoals(goals);
    if (goals.length > 0) {
      setSelectedUUID(goals[0].uuid);
      setDisableDelete(false);
    } else {
      setSelectedUUID(null);
      setDisableDelete(true);
    }
  }, [props.objectiveUUID, props.allGoals]);

  //propagate selected uuid up to the parent component
  useEffect(() => {
    parentSelectUUID(selectedUUID);
  }, [selectedUUID, parentSelectUUID]);

  return (
    <>
      <label htmlFor="goalSelect" className={styles.selectLabel}>
        Select Goal
      </label>
      <select
        id="goalSelect"
        onChange={(e) => setSelectedUUID(e.target.value)}
        value={selectedUUID}
        className={styles.selectField}
      >
        {filteredGoals.map((obj: STMGoal) => {
          return (
            <option key={obj.uuid} value={obj.uuid}>
              {`${obj.numbering}: ${obj.name}`}
            </option>
          );
        })}
      </select>
      &nbsp;
      <button
        type="button"
        onClick={() => {
          props.delSTM(selectedUUID, "Goal");
        }}
        disabled={disableDelete}
      >
        Delete Goal
      </button>
    </>
  );
};

//Investigation select component.
const InvestigationSelect = (props: {
  allInvestigations: STMInvestigation[];
  goalUUID: string;
  delSTM: (uuid: string, stmType: string) => void;
}) => {
  const [filteredInvstgs, setFilteredInvstgs] = useState<STMInvestigation[]>([]);
  const [selectedUUID, setSelectedUUID] = useState("0");
  const [disableDelete, setDisableDelete] = useState(true);
  //filter down investigations
  useEffect(() => {
    const invstgs = props.allInvestigations.filter((invstg) => {
      return invstg.goal === props.goalUUID;
    });
    setFilteredInvstgs(invstgs);
    if (invstgs.length > 0) {
      setSelectedUUID(invstgs[0].uuid);
      setDisableDelete(false);
    } else {
      setDisableDelete(true);
    }
  }, [props.goalUUID, props.allInvestigations]);

  return (
    <>
      <label htmlFor="invstgSelect" className={styles.selectLabel}>
        Select Investigation
      </label>
      <select
        id="invstgSelect"
        onChange={(e) => setSelectedUUID(e.target.value)}
        value={selectedUUID}
        className={styles.selectField}
      >
        {filteredInvstgs.map((obj: STMInvestigation) => {
          return (
            <option key={obj.uuid} value={obj.uuid}>
              {`${obj.numbering}: ${obj.name}`}
            </option>
          );
        })}
      </select>
      &nbsp;
      <button
        type="button"
        onClick={() => {
          props.delSTM(selectedUUID, "Investigation");
        }}
        disabled={disableDelete}
      >
        Delete Investigation
      </button>
    </>
  );
};

//Add new objective component
const NewObjectiveFields = (props: { missionId: number; reloadSTM: (id: number) => void }) => {
  const [newObjective, setNewObjective] = useState<STMObjective>({
    uuid: uuidv4(),
    name: "",
    numbering: "",
    mission: null,
  });

  //add new objective
  async function addNewObjective() {
    newObjective.mission = props.missionId;
    await upsertSTM(props.missionId, newObjective, "Objective");
    setNewObjective({
      uuid: uuidv4(),
      name: "",
      numbering: "",
      mission: null,
    }); //reset to blank new object with new uuid
    props.reloadSTM(props.missionId);
  }

  return (
    <>
      <label htmlFor="newObjNumbering">Numbering</label>&nbsp;
      <input
        id="newObjNumbering"
        type="text"
        onChange={(e) => {
          setNewObjective({ ...newObjective, numbering: e.target.value });
        }}
        value={newObjective?.numbering}
        className={styles.numberingField}
      />
      &nbsp;
      <label htmlFor="newObjName">Name</label>&nbsp;
      <input
        id="newObjName"
        type="text"
        onChange={(e) => {
          setNewObjective({ ...newObjective, name: e.target.value });
        }}
        value={newObjective?.name}
        className={styles.nameField}
      />
      &nbsp;
      <button
        type="button"
        onClick={() => {
          addNewObjective();
        }}
      >
        Add New Objective
      </button>
    </>
  );
};

//Add new goal component
const NewGoalFields = (props: {
  objectiveUUID: string;
  missionId: number;
  reloadSTM: (id: number) => void;
}) => {
  const [newGoal, setNewGoal] = useState<STMGoal>({
    uuid: uuidv4(),
    name: "",
    numbering: "",
    objective: "",
  });

  //add new goal
  async function addNewGoal() {
    newGoal.objective = props.objectiveUUID;
    await upsertSTM(props.missionId, newGoal, "Goal");
    setNewGoal({
      uuid: uuidv4(),
      name: "",
      numbering: "",
      objective: "",
    }); //reset to blank new object with new uuid
    props.reloadSTM(props.missionId);
  }

  return (
    <>
      <label htmlFor="newGoalNumbering">Lettering</label>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
      <input
        id="newGoalNumbering"
        type="text"
        onChange={(e) => {
          setNewGoal({ ...newGoal, numbering: e.target.value });
        }}
        value={newGoal.numbering}
        className={styles.numberingField}
      />
      &nbsp;
      <label htmlFor="newGoalName">Name</label>&nbsp;
      <input
        id="newGoalName"
        type="text"
        onChange={(e) => {
          setNewGoal({ ...newGoal, name: e.target.value });
        }}
        value={newGoal.name}
        className={styles.nameField}
      />
      &nbsp;
      <button
        type="button"
        onClick={() => {
          addNewGoal();
        }}
      >
        Add New Goal to Objective
      </button>
    </>
  );
};

//Add new investigation component
const NewInvstgFields = (props: {
  goalUUID: string;
  missionId: number;
  reloadSTM: (id: number) => void;
}) => {
  const [newInvstg, setNewInvstg] = useState<STMInvestigation>({
    uuid: uuidv4(),
    name: "",
    numbering: "",
    goal: "",
  });

  //add new investigation
  async function addNewInvstg() {
    newInvstg.goal = props.goalUUID;
    await upsertSTM(props.missionId, newInvstg, "Investigation");
    setNewInvstg({
      uuid: uuidv4(),
      numbering: "",
      name: "",
      goal: "",
    });
    props.reloadSTM(props.missionId);
  }

  return (
    <>
      <label htmlFor="newInvstgNumbering">Numbering</label>&nbsp;
      <input
        id="newInvstgNumbering"
        type="text"
        onChange={(e) => {
          setNewInvstg({ ...newInvstg, numbering: e.target.value });
        }}
        value={newInvstg?.numbering}
        className={styles.numberingField}
      />
      &nbsp;
      <label htmlFor="newInvstgName">Name</label>&nbsp;
      <input
        id="newInvstgName"
        type="text"
        onChange={(e) => {
          setNewInvstg({ ...newInvstg, name: e.target.value });
        }}
        value={newInvstg?.name}
        className={styles.nameField}
      />
      &nbsp;
      <button
        type="button"
        onClick={() => {
          addNewInvstg();
        }}
      >
        Add New Investigation to Goal
      </button>
    </>
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
}) => {
  if (props.objectives.length > 0) {
    return (
      <ul>
        {props.objectives.map((objv: STMObjective) => {
          return (
            <li key={objv.uuid}>
              Objective {objv.numbering}: {objv.name}
              <GoalList
                parentNumbering={objv.numbering}
                parentuuid={objv.uuid}
                goals={props.goals}
                investigations={props.investigations}
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
}) => {
  if (props.goals) {
    return (
      <ul>
        {props.goals
          .filter((goal) => goal.objective === props.parentuuid)
          .map((goal: STMGoal) => {
            const goalNumbering = `${props.parentNumbering}${goal.numbering}`;
            return (
              <li key={goal.uuid}>
                Goal {goalNumbering}: {goal.name}
                <InvestigationList
                  parentNumbering={goalNumbering}
                  parentuuid={goal.uuid}
                  investigations={props.investigations}
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
}) => {
  if (props.investigations) {
    return (
      <ul>
        {props.investigations
          .filter((invstg) => invstg.goal === props.parentuuid)
          .map((invstg: STMInvestigation) => {
            return (
              <li key={invstg.uuid}>
                Investigation {`${props.parentNumbering}-${invstg.numbering}`}: {invstg.name}
              </li>
            );
          })}
      </ul>
    );
  }
};

export default STM;
