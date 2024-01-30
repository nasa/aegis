import { FunctionComponent, useEffect, useState } from "react";
import stmStyles from "./stmEdit.module.css";
import { deleteSTMs, upsertSTMs } from "http-client/stm";
import { v4 as uuidv4 } from "uuid";
import { roundDateToSecond } from "utils/formatting";

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

  //set default objective selected uuid
  useEffect(() => {
    if (!selectedObjUUID && allObjectives?.length > 0) {
      setSelectedObjUUID(allObjectives[0].uuid);
    } else if (!allObjectives || allObjectives.length === 0) {
      setSelectedObjUUID(null);
    }
  }, [allObjectives, selectedObjUUID]);

  return (
    <>
      <div id="stmEdit_div">
        <div>
          <div className={stmStyles.div_select} />
          <div id="div_addObjective" className={stmStyles.div_add}>
            <NewObjectiveFields missionId={props.missionId} reloadSTM={props.reloadSTMfromDB} />
          </div>
        </div>
        {allObjectives?.length > 0 && selectedObjUUID && (
          <div>
            <div id="div_selectObjective" className={stmStyles.div_select}>
              <ObjectiveSelect
                objectives={props.allObjectives}
                selectedObjUUID={selectedObjUUID}
                setSelectedObjUUID={setSelectedObjUUID}
                setSelectedGoalUUID={setSelectedGoalUUID}
              />
            </div>
            <div id="div_addGoal" className={stmStyles.div_add}>
              <NewGoalFields
                objectiveUUID={selectedObjUUID}
                missionId={props.missionId}
                reloadSTM={props.reloadSTMfromDB}
              />
            </div>
          </div>
        )}
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
      <h3>Import/Export STM</h3>
      <div className={stmStyles.importExport}>
        <ExportSTM
          allObjectives={props.allObjectives}
          allGoals={props.allGoals}
          allInvestigations={props.allInvestigations}
        />
        <ImportSTM missionId={props.missionId} reloadSTMfromDB={props.reloadSTMfromDB} />
      </div>
    </>
  );
};

const destructiveImportSTM = async (stmJson: string, missionId: number) => {
  const stm = JSON.parse(stmJson);
  // delete all esiting STM items for this mission from the db via the API
  deleteSTMs(missionId, "ALL");

  // add all STM items from the imported JSON to the store
  stm.objectives?.forEach(async (obj: STMObjective) => {
    const newObjective: STMObjective = {
      uuid: uuidv4(),
      name: obj.name,
      numbering: obj.numbering,
      missionId,
      createdAt: new Date(Date.now()).toISOString(),
      updatedAt: new Date(Date.now()).toISOString(),
    };
    await upsertSTMs(missionId, [newObjective], "Objective");

    //get nested goals
    const childGoals = stm.goals.filter((g: STMGoal) => g.objectiveUuid === obj.uuid);
    childGoals.forEach(async (goal: STMGoal) => {
      const newGoal: STMGoal = {
        uuid: uuidv4(),
        name: goal.name,
        numbering: goal.numbering,
        objectiveUuid: newObjective.uuid,
        createdAt: new Date(Date.now()).toISOString(),
        updatedAt: new Date(Date.now()).toISOString(),
      };
      await upsertSTMs(missionId, [newGoal], "Goal");

      //get nested invstg
      const childInvstg = stm.investigations.filter(
        (i: STMInvestigation) => i.goalUuid === goal.uuid
      );
      childInvstg.forEach(async (invstg: STMInvestigation) => {
        const newInvstg: STMInvestigation = {
          uuid: uuidv4(),
          name: invstg.name,
          numbering: invstg.numbering,
          goalUuid: newGoal.uuid,
          createdAt: new Date(Date.now()).toISOString(),
          updatedAt: new Date(Date.now()).toISOString(),
        };
        await upsertSTMs(missionId, [newInvstg], "Investigation");
      });
    });
  });
};

const ExportSTM = (props: {
  allObjectives: STMObjective[];
  allGoals: STMGoal[];
  allInvestigations: STMInvestigation[];
}) => {
  // strip out missionId, createdAt, and updatedAt from all STM items
  // keep uuid in order to maintain relationship
  const objectives = props.allObjectives.map((obj: STMObjective) => {
    return {
      uuid: obj.uuid,
      name: obj.name,
      numbering: obj.numbering,
    };
  });
  const goals = props.allGoals.map((goal: STMGoal) => {
    return {
      uuid: goal.uuid,
      name: goal.name,
      numbering: goal.numbering,
      objectiveUuid: goal.objectiveUuid,
    };
  });
  const investigations = props.allInvestigations.map((invstg: STMInvestigation) => {
    return {
      uuid: invstg.uuid,
      name: invstg.name,
      numbering: invstg.numbering,
      goalUuid: invstg.goalUuid,
    };
  });

  const stm = {
    objectives: objectives,
    goals: goals,
    investigations: investigations,
  };

  const exportSTM = () => {
    const stmString = JSON.stringify(stm);
    const stmBlob = new Blob([stmString], { type: "application/json" });
    const stmUrl = URL.createObjectURL(stmBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = stmUrl;
    downloadLink.download = "stm.json";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  return (
    <>
      <div className={stmStyles.exportContainer}>
        <button onClick={exportSTM} className={stmStyles.exportButton}>
          Export STM to JSON
        </button>
      </div>
    </>
  );
};

const ImportSTM = (props: { missionId: number; reloadSTMfromDB: Function }) => {
  const [stmJson, setStmJson] = useState<string>(null);

  return (
    <>
      <textarea
        id="importStm"
        placeholder="paste STM json to import here"
        onChange={(e) => setStmJson(e.target.value)}
      />
      <button
        onClick={() => {
          if (
            confirm(
              "Are you sure you want to import? This will destroy all existing STM records for this mission"
            )
          ) {
            destructiveImportSTM(stmJson, props.missionId);
            props.reloadSTMfromDB(props.missionId);
          }
        }}
      >
        Import STM
      </button>
    </>
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
  setSelectedGoalUUID: (uuid: string) => void;
}) => {
  return (
    <>
      <label htmlFor="objSelect" className={stmStyles.selectLabel}>
        Select Objective
      </label>
      <select
        id="objSelect"
        onChange={(e) => {
          props.setSelectedObjUUID(e.target.value);
          //reset selected goal when objective changes
          props.setSelectedGoalUUID(null);
        }}
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
      return goal.objectiveUuid === props.objectiveUUID;
    });
    setFilteredGoals(goals);
    if (!props.selectedGoalUUID) {
      if (goals.length > 0) {
        props.setSelectedGoalUUID(goals[0].uuid);
      } else {
        props.setSelectedGoalUUID(null);
      }
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
    missionId: null,
  });

  //add new objective
  async function addNewObjective() {
    const upsertRecord: STMObjective = {
      ...newObjective,
      missionId: props.missionId,
      createdAt: roundDateToSecond(new Date()).toISOString(),
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    await upsertSTMs(props.missionId, [upsertRecord], "Objective");
    setNewObjective({
      uuid: null,
      name: "",
      numbering: "",
      missionId: null,
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
    objectiveUuid: "",
  });

  //add new goal
  async function addNewGoal() {
    const upsertRecord: STMGoal = {
      ...newGoal,
      objectiveUuid: props.objectiveUUID,
      createdAt: roundDateToSecond(new Date()).toISOString(),
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    await upsertSTMs(props.missionId, [upsertRecord], "Goal");
    setNewGoal({
      uuid: null,
      name: "",
      numbering: "",
      objectiveUuid: "",
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
    goalUuid: "",
  });

  //add new investigation
  async function addNewInvstg() {
    const upsertRecord: STMInvestigation = {
      ...newInvstg,
      goalUuid: props.goalUUID,
      createdAt: roundDateToSecond(new Date()).toISOString(),
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    await upsertSTMs(props.missionId, [upsertRecord], "Investigation");
    setNewInvstg({
      uuid: null,
      numbering: "",
      name: "",
      goalUuid: "",
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
