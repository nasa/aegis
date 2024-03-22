import { FunctionComponent, useEffect, useState } from "react";
import stmStyles from "./stmEdit.module.css";
import { deleteSTMs, upsertSTMs } from "http-client/stm";
import { v4 as uuidv4 } from "uuid";
import { roundDateToSecond } from "utils/formatting";

interface STMProps {
  reloadSTMfromDB: (missionId: number) => void;
  missionId: number;
  allLevel1s: STMLevel1[];
  allLevel2s: STMLevel2[];
  allLevel3s: STMLevel3[];
}

const STMEdit: FunctionComponent<STMProps> = (props: STMProps) => {
  const allLevel1s = props.allLevel1s;

  //track states of selected STM items in the drop downs
  const [selectedLevel1Uuid, setSelectedLevel1Uuid] = useState(null);
  const [selectedLevel2Uuid, setSelectedLevel2Uuid] = useState(null);

  //set default level1 selected uuid
  useEffect(() => {
    if (!selectedLevel1Uuid && allLevel1s?.length > 0) {
      setSelectedLevel1Uuid(allLevel1s[0].uuid);
    } else if (!allLevel1s || allLevel1s.length === 0) {
      setSelectedLevel1Uuid(null);
    }
  }, [allLevel1s, selectedLevel1Uuid]);

  return (
    <>
      <div id="stmEdit_div">
        <div>
          <div className={stmStyles.div_select} />
          <div id="div_addLevel1" className={stmStyles.div_add}>
            <NewLevel1Fields missionId={props.missionId} reloadSTM={props.reloadSTMfromDB} />
          </div>
        </div>
        {allLevel1s?.length > 0 && selectedLevel1Uuid && (
          <div>
            <div id="div_selectLevel1s" className={stmStyles.div_select}>
              <Level1Select
                level1s={props.allLevel1s}
                selectedLevel1Uuid={selectedLevel1Uuid}
                setSelectedLevel1Uuid={setSelectedLevel1Uuid}
                setSelectedLevel2UUID={setSelectedLevel2Uuid}
              />
            </div>
            <div id="div_addLevel2" className={stmStyles.div_add}>
              <NewLevel2Fields
                level1Uuid={selectedLevel1Uuid}
                missionId={props.missionId}
                reloadSTM={props.reloadSTMfromDB}
              />
            </div>
          </div>
        )}
        <div>
          <div id="div_selectLevel2" className={stmStyles.div_select}>
            <Level2Select
              allLevel2s={props.allLevel2s}
              level1Uuid={selectedLevel1Uuid}
              selectedLevel2Uuid={selectedLevel2Uuid}
              setSelectedLevel2Uuid={setSelectedLevel2Uuid}
            />
          </div>
          <div id="div_addLevel3" className={stmStyles.div_add}>
            <NewLevel3Fields
              level2Uuid={selectedLevel2Uuid}
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
          allLevel1s={props.allLevel1s}
          allLevel2s={props.allLevel2s}
          allLevel3s={props.allLevel3s}
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
  stm.level1s?.forEach(async (obj: STMLevel1) => {
    const newLevel1: STMLevel1 = {
      uuid: uuidv4(),
      name: obj.name,
      numbering: obj.numbering,
      missionId,
      createdAt: new Date(Date.now()).toISOString(),
      updatedAt: new Date(Date.now()).toISOString(),
    };
    await upsertSTMs(missionId, [newLevel1], "Level1");

    //get nested level2s
    const childLevel2s = stm.level2s.filter((g: STMLevel2) => g.level1Uuid === obj.uuid);
    childLevel2s.forEach(async (level2: STMLevel2) => {
      const newLevel2: STMLevel2 = {
        uuid: uuidv4(),
        name: level2.name,
        numbering: level2.numbering,
        level1Uuid: newLevel1.uuid,
        createdAt: new Date(Date.now()).toISOString(),
        updatedAt: new Date(Date.now()).toISOString(),
      };
      await upsertSTMs(missionId, [newLevel2], "Level2");

      //get nested level3s
      const childLevel3 = stm.level3s.filter((i: STMLevel3) => i.level2Uuid === level2.uuid);
      childLevel3.forEach(async (level3s: STMLevel3) => {
        const newLevel3: STMLevel3 = {
          uuid: uuidv4(),
          name: level3s.name,
          numbering: level3s.numbering,
          level2Uuid: newLevel2.uuid,
          createdAt: new Date(Date.now()).toISOString(),
          updatedAt: new Date(Date.now()).toISOString(),
        };
        await upsertSTMs(missionId, [newLevel3], "Level3");
      });
    });
  });
};

const ExportSTM = (props: {
  allLevel1s: STMLevel1[];
  allLevel2s: STMLevel2[];
  allLevel3s: STMLevel3[];
}) => {
  // strip out missionId, createdAt, and updatedAt from all STM items
  // keep uuid in order to maintain relationship
  const level1s = props.allLevel1s.map((level1: STMLevel1) => {
    return {
      uuid: level1.uuid,
      name: level1.name,
      numbering: level1.numbering,
    };
  });
  const level2s = props.allLevel2s.map((level2: STMLevel2) => {
    return {
      uuid: level2.uuid,
      name: level2.name,
      numbering: level2.numbering,
      level1Uuid: level2.level1Uuid,
    };
  });
  const level3s = props.allLevel3s.map((level3: STMLevel3) => {
    return {
      uuid: level3.uuid,
      name: level3.name,
      numbering: level3.numbering,
      level2Uuid: level3.level2Uuid,
    };
  });

  const stm = {
    level1s,
    level2s,
    level3s,
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

//Level1 select component.
const Level1Select = (props: {
  level1s: STMLevel1[];
  selectedLevel1Uuid: string;
  setSelectedLevel1Uuid: (uuid: string) => void;
  setSelectedLevel2UUID: (uuid: string) => void;
}) => {
  return (
    <>
      <label htmlFor="objSelect" className={stmStyles.selectLabel}>
        Select Level1
      </label>
      <select
        id="objSelect"
        onChange={(e) => {
          props.setSelectedLevel1Uuid(e.target.value);
          //reset selected level2 when level1 changes
          props.setSelectedLevel2UUID(null);
        }}
        value={props.selectedLevel1Uuid}
        className={stmStyles.selectField}
      >
        {props.level1s.map((obj: STMLevel1) => {
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

//Level2 select component
const Level2Select = (props: {
  allLevel2s: STMLevel2[];
  level1Uuid: string;
  selectedLevel2Uuid: string;
  setSelectedLevel2Uuid: (uuid: string) => void;
}) => {
  const [filteredLevel2s, setFilteredLevel2s] = useState<STMLevel2[]>([]);

  //filter down level2s
  useEffect(() => {
    const level2s = props.allLevel2s.filter((level2) => {
      return level2.level1Uuid === props.level1Uuid;
    });
    setFilteredLevel2s(level2s);
    if (!props.selectedLevel2Uuid) {
      if (level2s.length > 0) {
        props.setSelectedLevel2Uuid(level2s[0].uuid);
      } else {
        props.setSelectedLevel2Uuid(null);
      }
    }
  }, [props]);

  return (
    filteredLevel2s?.length > 0 &&
    props.selectedLevel2Uuid && (
      <>
        <label htmlFor="level2Select" className={stmStyles.selectLabel}>
          Select Level2
        </label>
        <select
          id="level2Select"
          onChange={(e) => props.setSelectedLevel2Uuid(e.target.value)}
          value={props.selectedLevel2Uuid}
          className={stmStyles.selectField}
        >
          {filteredLevel2s.map((obj: STMLevel2) => {
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

//Add new level1 component
const NewLevel1Fields = (props: { missionId: number; reloadSTM: (id: number) => void }) => {
  const [newLevel1, setNewLevel1] = useState<STMLevel1>({
    uuid: null,
    name: "",
    numbering: "",
    missionId: null,
  });

  //add new level1
  async function addNewLevel1() {
    const upsertRecord: STMLevel1 = {
      ...newLevel1,
      missionId: props.missionId,
      createdAt: roundDateToSecond(new Date()).toISOString(),
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    await upsertSTMs(props.missionId, [upsertRecord], "Level1");
    setNewLevel1({
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
          setNewLevel1({ ...newLevel1, numbering: e.target.value });
        }}
        value={newLevel1?.numbering}
        className={stmStyles.numberingField}
      />
      &nbsp;
      <label htmlFor="newObjName">Name</label>&nbsp;
      <input
        id="newObjName"
        type="text"
        onChange={(e) => {
          setNewLevel1({ ...newLevel1, name: e.target.value });
        }}
        value={newLevel1?.name}
        className={stmStyles.nameField}
      />
      &nbsp;
      <button
        type="button"
        onClick={() => {
          addNewLevel1();
        }}
      >
        Add New Level1
      </button>
    </>
  );
};

//Add new goal component
const NewLevel2Fields = (props: {
  level1Uuid: string;
  missionId: number;
  reloadSTM: (id: number) => void;
}) => {
  const [newLevel2, setNewLevel2] = useState<STMLevel2>({
    uuid: null,
    name: "",
    numbering: "",
    level1Uuid: "",
  });

  //add new goal
  async function addNewLevel2() {
    const upsertRecord: STMLevel2 = {
      ...newLevel2,
      level1Uuid: props.level1Uuid,
      createdAt: roundDateToSecond(new Date()).toISOString(),
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    await upsertSTMs(props.missionId, [upsertRecord], "Level2");
    setNewLevel2({
      uuid: null,
      name: "",
      numbering: "",
      level1Uuid: "",
    }); //reset to blank new object with new uuid
    props.reloadSTM(props.missionId);
  }

  return (
    props.level1Uuid && (
      <>
        <label htmlFor="newLevel2Numbering">Lettering</label>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        <input
          id="newLevel2Numbering"
          type="text"
          onChange={(e) => {
            setNewLevel2({ ...newLevel2, numbering: e.target.value });
          }}
          value={newLevel2.numbering}
          className={stmStyles.numberingField}
        />
        &nbsp;
        <label htmlFor="newLevel2Name">Name</label>&nbsp;
        <input
          id="newLevel2Name"
          type="text"
          onChange={(e) => {
            setNewLevel2({ ...newLevel2, name: e.target.value });
          }}
          value={newLevel2.name}
          className={stmStyles.nameField}
        />
        &nbsp;
        <button
          type="button"
          onClick={() => {
            addNewLevel2();
          }}
        >
          Add New Level2 to Level1
        </button>
      </>
    )
  );
};

//Add new level3 component
const NewLevel3Fields = (props: {
  level2Uuid: string;
  missionId: number;
  reloadSTM: (id: number) => void;
}) => {
  const [newLevel3, setNewLevel3] = useState<STMLevel3>({
    uuid: null,
    name: "",
    numbering: "",
    level2Uuid: "",
  });

  //add new level3
  async function addNewLevel3() {
    const upsertRecord: STMLevel3 = {
      ...newLevel3,
      level2Uuid: props.level2Uuid,
      createdAt: roundDateToSecond(new Date()).toISOString(),
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    await upsertSTMs(props.missionId, [upsertRecord], "Level3");
    setNewLevel3({
      uuid: null,
      numbering: "",
      name: "",
      level2Uuid: "",
    });
    props.reloadSTM(props.missionId);
  }

  return (
    props.level2Uuid && (
      <>
        <label htmlFor="newLevel3Numbering">Numbering</label>&nbsp;
        <input
          id="newLevel3Numbering"
          type="text"
          onChange={(e) => {
            setNewLevel3({ ...newLevel3, numbering: e.target.value });
          }}
          value={newLevel3?.numbering}
          className={stmStyles.numberingField}
        />
        &nbsp;
        <label htmlFor="newLevel3Name">Name</label>&nbsp;
        <input
          id="newLevel3Name"
          type="text"
          onChange={(e) => {
            setNewLevel3({ ...newLevel3, name: e.target.value });
          }}
          value={newLevel3?.name}
          className={stmStyles.nameField}
        />
        &nbsp;
        <button
          type="button"
          onClick={() => {
            addNewLevel3();
          }}
        >
          Add New Level3 to Level2
        </button>
      </>
    )
  );
};

export default STMEdit;
