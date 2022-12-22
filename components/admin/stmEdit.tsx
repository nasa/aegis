import { FunctionComponent, useEffect, useState } from "react";
import stmStyles from "./stmEdit.module.css";
import { upsertSTM } from "http-client/stm";

interface STMProps {
  reloadSTMfromDB: (missionId: number) => void;
  missionId: number;
  allObjectives: STMObjective[];
  allGoals: STMGoal[];
  allInvestigations: STMInvestigation[];
}

const STMEdit: FunctionComponent<STMProps> = (props: STMProps) => {
  const allObjectives = props.allObjectives;

  //track states of selected STM items in the drop downs
  const [selectedObjUUID, setSelectedObjUUID] = useState(null);
  const [selectedGoalUUID, setSelectedGoalUUID] = useState(null);

  //set default selected uuid
  useEffect(() => {
    if (allObjectives?.length > 0) {
      setSelectedObjUUID(allObjectives[0].uuid);
    }
  }, [allObjectives]);

  return (
    <div id="stmEdit_div">
      <div>
        <div className={stmStyles.div_select}></div>
        <div id="div_addObjective" className={stmStyles.div_add}>
          <NewObjectiveFields missionId={props.missionId} reloadSTM={props.reloadSTMfromDB} />
        </div>
      </div>
      <div>
        <div id="div_selectObjective" className={stmStyles.div_select}>
          {allObjectives?.length > 0 && selectedObjUUID && (
            <ObjectiveSelect
              objectives={props.allObjectives}
              selectedObjUUID={selectedObjUUID}
              setSelectedObjUUID={setSelectedObjUUID}
            />
          )}
        </div>
        <div id="div_addGoal" className={stmStyles.div_add}>
          <NewGoalFields
            objectiveUUID={selectedObjUUID}
            missionId={props.missionId}
            reloadSTM={props.reloadSTMfromDB}
          />
        </div>
      </div>
      <div>
        <div id="div_selectGoal" className={stmStyles.div_select}>
          <GoalSelect
            allGoals={props.allGoals}
            objectiveUUID={selectedObjUUID}
            selectedGoalUUID={selectedGoalUUID}
            setSelectedGoalUUID={setSelectedGoalUUID}
          />
        </div>
        <div id="div_addInvestigation" className={stmStyles.div_add}>
          <NewInvstgFields
            goalUUID={selectedGoalUUID}
            missionId={props.missionId}
            reloadSTM={props.reloadSTMfromDB}
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
  selectedObjUUID: string;
  setSelectedObjUUID: (uuid: string) => void;
}) => {
  return (
    <>
      <label htmlFor="objSelect" className={stmStyles.selectLabel}>
        Select Objective
      </label>
      <select
        id="objSelect"
        onChange={(e) => props.setSelectedObjUUID(e.target.value)}
        value={props.selectedObjUUID}
        className={stmStyles.selectField}
      >
        {props.objectives.map((obj: STMObjective) => {
          return (
            <option key={obj.uuid} value={obj.uuid}>
              {`${obj.numbering}: ${obj.name}`}
            </option>
          );
        })}
      </select>
    </>
  );
};

//Goal select component
const GoalSelect = (props: {
  allGoals: STMGoal[];
  objectiveUUID: string;
  selectedGoalUUID: string;
  setSelectedGoalUUID: (uuid: string) => void;
}) => {
  const [filteredGoals, setFilteredGoals] = useState<STMGoal[]>([]);

  //filter down goals
  useEffect(() => {
    const goals = props.allGoals.filter((goal) => {
      return goal.objective === props.objectiveUUID;
    });
    setFilteredGoals(goals);
    if (goals.length > 0) {
      props.setSelectedGoalUUID(goals[0].uuid);
    } else {
      props.setSelectedGoalUUID(null);
    }
  }, [props]);

  return (
    filteredGoals?.length > 0 &&
    props.selectedGoalUUID && (
      <>
        <label htmlFor="goalSelect" className={stmStyles.selectLabel}>
          Select Goal
        </label>
        <select
          id="goalSelect"
          onChange={(e) => props.setSelectedGoalUUID(e.target.value)}
          value={props.selectedGoalUUID}
          className={stmStyles.selectField}
        >
          {filteredGoals.map((obj: STMGoal) => {
            return (
              <option key={obj.uuid} value={obj.uuid}>
                {`${obj.numbering}: ${obj.name}`}
              </option>
            );
          })}
        </select>
      </>
    )
  );
};

//Add new objective component
const NewObjectiveFields = (props: { missionId: number; reloadSTM: (id: number) => void }) => {
  const [newObjective, setNewObjective] = useState<STMObjective>({
    uuid: null,
    name: "",
    numbering: "",
    mission: null,
  });

  //add new objective
  async function addNewObjective() {
    const upsertRecord: STMObjective = { ...newObjective, mission: props.missionId };
    await upsertSTM(props.missionId, upsertRecord, "Objective");
    setNewObjective({
      uuid: null,
      name: "",
      numbering: "",
      mission: null,
    }); //reset to blank new object
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
        className={stmStyles.numberingField}
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
        className={stmStyles.nameField}
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
    uuid: null,
    name: "",
    numbering: "",
    objective: "",
  });

  //add new goal
  async function addNewGoal() {
    const upsertRecord: STMGoal = { ...newGoal, objective: props.objectiveUUID };
    await upsertSTM(props.missionId, upsertRecord, "Goal");
    setNewGoal({
      uuid: null,
      name: "",
      numbering: "",
      objective: "",
    }); //reset to blank new object with new uuid
    props.reloadSTM(props.missionId);
  }

  return (
    props.objectiveUUID && (
      <>
        <label htmlFor="newGoalNumbering">Lettering</label>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        <input
          id="newGoalNumbering"
          type="text"
          onChange={(e) => {
            setNewGoal({ ...newGoal, numbering: e.target.value });
          }}
          value={newGoal.numbering}
          className={stmStyles.numberingField}
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
          className={stmStyles.nameField}
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
    )
  );
};

//Add new investigation component
const NewInvstgFields = (props: {
  goalUUID: string;
  missionId: number;
  reloadSTM: (id: number) => void;
}) => {
  const [newInvstg, setNewInvstg] = useState<STMInvestigation>({
    uuid: null,
    name: "",
    numbering: "",
    goal: "",
  });

  //add new investigation
  async function addNewInvstg() {
    const upsertRecord: STMInvestigation = { ...newInvstg, goal: props.goalUUID };
    await upsertSTM(props.missionId, upsertRecord, "Investigation");
    setNewInvstg({
      uuid: null,
      numbering: "",
      name: "",
      goal: "",
    });
    props.reloadSTM(props.missionId);
  }

  return (
    props.goalUUID && (
      <>
        <label htmlFor="newInvstgNumbering">Numbering</label>&nbsp;
        <input
          id="newInvstgNumbering"
          type="text"
          onChange={(e) => {
            setNewInvstg({ ...newInvstg, numbering: e.target.value });
          }}
          value={newInvstg?.numbering}
          className={stmStyles.numberingField}
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
          className={stmStyles.nameField}
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
    )
  );
};

export default STMEdit;
