import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";
import stmStyles from "./stmEdit.module.css";
import adminStyles from "./admin.module.css";
import adminCommon from "pages/admin/adminCommon.module.css";
import { v4 as uuidv4 } from "uuid";
import {
  generateBlankStmLvl1,
  generateBlankStmLvl2,
  generateBlankStmLvl3,
} from "store/storeUtils/stm";
import { Checkbox, InLineEditInput } from "components/interface/form/globalFields";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { getAccurateNow } from "utils/formatting";
import { useDocSelector } from "utils/useDocSelector";
import { applyReplaceStmTree, applyUpsertStmLevel } from "operations/apply/apply-mission-stm";
import { deepEqual } from "utils/useAppSelector";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type ChangeMission = (updateFn: (m: Mission) => void) => void;

const STMEdit: FunctionComponent<{
  changeMission: ChangeMission;
  missionId: number;
  automergeUrl: AutomergeUrl;
  allLevel1s: STMLevel1[];
  allLevel2s: STMLevel2[];
  allLevel3s: STMLevel3[];
}> = ({ changeMission, missionId, automergeUrl, allLevel1s, allLevel2s, allLevel3s }) => {
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
      <div id="stmEdit_div" className={adminStyles.sectionDiv}>
        <div className={adminStyles.sectionDivHeading}>Add/Delete STM</div>
        <div>
          <div className={stmStyles.div_select} />
          <div id="div_addLevel1" className={stmStyles.div_add}>
            <NewLevel1Fields changeMission={changeMission} />
          </div>
        </div>
        {allLevel1s?.length > 0 && selectedLevel1Uuid && (
          <div>
            <div id="div_selectLevel1s" className={stmStyles.div_select}>
              <Level1Select
                level1s={allLevel1s}
                selectedLevel1Uuid={selectedLevel1Uuid}
                setSelectedLevel1Uuid={setSelectedLevel1Uuid}
                setSelectedLevel2UUID={setSelectedLevel2Uuid}
              />
            </div>
            <div id="div_addLevel2" className={stmStyles.div_add}>
              <NewLevel2Fields level1Uuid={selectedLevel1Uuid} changeMission={changeMission} />
            </div>
          </div>
        )}
        <div>
          <div id="div_selectLevel2" className={stmStyles.div_select}>
            <Level2Select
              allLevel2s={allLevel2s}
              level1Uuid={selectedLevel1Uuid}
              selectedLevel2Uuid={selectedLevel2Uuid}
              setSelectedLevel2Uuid={setSelectedLevel2Uuid}
            />
          </div>
          <div id="div_addLevel3" className={stmStyles.div_add}>
            <NewLevel3Fields level2Uuid={selectedLevel2Uuid} changeMission={changeMission} />
          </div>
        </div>
        *STM items can only be deleted if they have no children
      </div>
      <div className={adminStyles.sectionDiv}>
        <div className={adminStyles.sectionDivHeading}>STM Level Names</div>
        <LevelNames automergeUrl={automergeUrl} changeMission={changeMission} />
      </div>
      <div className={adminStyles.sectionDiv}>
        <div className={adminStyles.sectionDivHeading}>Import/Export STM</div>
        <ExportSTM allLevel1s={allLevel1s} allLevel2s={allLevel2s} allLevel3s={allLevel3s} />
        <div className={stmStyles.importExport}>
          <ImportSTM missionId={missionId} changeMission={changeMission} />
        </div>
      </div>
    </>
  );
};

/**
 * Replace every STM item on the mission with the items from an exported STM JSON. New uuids
 * are allocated so the import never collides with items from another mission.
 */
const destructiveImportSTM = (stmJson: string, missionId: number, changeMission: ChangeMission) => {
  const stm = JSON.parse(stmJson);
  const now = getAccurateNow().getTime();
  const level1s: STMLevel1[] = [];
  const level2s: STMLevel2[] = [];
  const level3s: STMLevel3[] = [];
  for (const obj of (stm.level1s ?? []) as STMLevel1[]) {
    const newLevel1: STMLevel1 = {
      uuid: uuidv4(),
      name: obj.name,
      numbering: obj.numbering,
      createdAt: now,
      updatedAt: now,
    };
    level1s.push(newLevel1);
    for (const level2 of ((stm.level2s ?? []) as STMLevel2[]).filter(
      (g) => g.level1Uuid === obj.uuid
    )) {
      const newLevel2: STMLevel2 = {
        uuid: uuidv4(),
        name: level2.name,
        numbering: level2.numbering,
        level1Uuid: newLevel1.uuid,
        createdAt: now,
        updatedAt: now,
      };
      level2s.push(newLevel2);
      for (const level3 of ((stm.level3s ?? []) as STMLevel3[]).filter(
        (i) => i.level2Uuid === level2.uuid
      )) {
        level3s.push({
          uuid: uuidv4(),
          name: level3.name,
          numbering: level3.numbering,
          level2Uuid: newLevel2.uuid,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }
  changeMission((m) => applyReplaceStmTree(m, { level1s, level2s, level3s }));
};

const LevelNames: FunctionComponent<{
  automergeUrl: AutomergeUrl;
  changeMission: ChangeMission;
}> = ({ automergeUrl, changeMission }) => {
  const partialMission = useDocSelector(
    automergeUrl,
    (doc: Mission) => ({
      id: doc.id,
      stmLevel1Enabled: doc.stmLevel1Enabled,
      stmLevel1Name: doc.stmLevel1Name,
      stmLevel2Name: doc.stmLevel2Name,
      stmLevel3Name: doc.stmLevel3Name,
    }),
    deepEqual
  );

  return (
    <>
      {partialMission && (
        <div className={stmStyles.levelNames}>
          <div className={stmStyles.levelNameInput}>
            <InLineEditInput
              value={partialMission.stmLevel1Name}
              editing={true}
              fieldProps={{
                name: "level1Name",
                ariaLabel: "Level 1 Name",
                style: { width: "100%" },
                validators: [],
                label: { label: "Level 1 Name", className: adminStyles.editLabel },
              }}
              onSubmit={(value) => {
                changeMission((m: Mission) => {
                  m.stmLevel1Name = value;
                });
              }}
              key={`${partialMission.id}-stmLevel1Name`}
              debounceSubmit={false}
            />
            <Checkbox
              checked={partialMission.stmLevel1Enabled}
              label={"Enable Level 1"}
              onChange={(value) => {
                changeMission((m: Mission) => {
                  m.stmLevel1Enabled = value.target.checked;
                });
              }}
              uniqueId={`${partialMission.id}-stmLevel1Enabled`}
            />
          </div>
          <div className={stmStyles.levelNameInput}>
            <InLineEditInput
              value={partialMission.stmLevel2Name}
              editing={true}
              fieldProps={{
                name: "level2name",
                ariaLabel: "Level 2 Name",
                style: { width: "100%" },
                validators: [],
                label: { label: "Level 2 Name", className: adminStyles.editLabel },
              }}
              onSubmit={(value) => {
                changeMission((m: Mission) => {
                  m.stmLevel2Name = value;
                });
              }}
              key={`${partialMission.id}-stmLevel2Name`}
              debounceSubmit={false}
            />
          </div>
          <div className={stmStyles.levelNameInput}>
            <InLineEditInput
              value={partialMission.stmLevel3Name}
              editing={true}
              fieldProps={{
                name: "level3name",
                ariaLabel: "Level 3 Name",
                style: { width: "100%" },
                validators: [],
                label: { label: "Level 3 Name", className: adminStyles.editLabel },
              }}
              onSubmit={(value) => {
                changeMission((m: Mission) => {
                  m.stmLevel3Name = value;
                });
              }}
              key={`${partialMission.id}-stmLevel3Name`}
              debounceSubmit={false}
            />
          </div>
        </div>
      )}
    </>
  );
};

const ExportSTM: FunctionComponent<{
  allLevel1s: STMLevel1[];
  allLevel2s: STMLevel2[];
  allLevel3s: STMLevel3[];
}> = ({ allLevel1s, allLevel2s, allLevel3s }) => {
  // strip out createdAt and updatedAt from all STM items
  // keep uuid in order to maintain relationship
  const level1s = allLevel1s.map((level1: STMLevel1) => {
    return {
      uuid: level1.uuid,
      name: level1.name,
      numbering: level1.numbering,
    };
  });
  const level2s = allLevel2s.map((level2: STMLevel2) => {
    return {
      uuid: level2.uuid,
      name: level2.name,
      numbering: level2.numbering,
      level1Uuid: level2.level1Uuid,
    };
  });
  const level3s = allLevel3s.map((level3: STMLevel3) => {
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
        <button onClick={exportSTM} className={adminCommon.button}>
          Export STM to JSON
        </button>
      </div>
    </>
  );
};

const ImportSTM: FunctionComponent<{
  missionId: number;
  changeMission: ChangeMission;
}> = ({ missionId, changeMission }) => {
  const [stmJson, setStmJson] = useState<string>(null);

  return (
    <>
      <textarea
        id="importStm"
        placeholder="paste STM json to import here"
        onChange={(e) => setStmJson(e.target.value)}
        style={{ width: "500px" }}
      />
      <button
        onClick={() => {
          if (
            confirm(
              "Are you sure you want to import? This will destroy all existing STM records for this mission"
            )
          ) {
            destructiveImportSTM(stmJson, missionId, changeMission);
          }
        }}
        className={adminCommon.button}
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
const Level1Select: FunctionComponent<{
  level1s: STMLevel1[];
  selectedLevel1Uuid: string;
  setSelectedLevel1Uuid: (uuid: string) => void;
  setSelectedLevel2UUID: (uuid: string) => void;
}> = ({ level1s, setSelectedLevel1Uuid, selectedLevel1Uuid, setSelectedLevel2UUID }) => {
  return (
    <>
      <label htmlFor="objSelect" className={stmStyles.selectLabel}>
        Select Level1
      </label>
      <select
        id="objSelect"
        onChange={(e) => {
          setSelectedLevel1Uuid(e.target.value);
          //reset selected level2 when level1 changes
          setSelectedLevel2UUID(null);
        }}
        value={selectedLevel1Uuid}
        className={stmStyles.selectField}
      >
        {level1s.map((obj: STMLevel1) => {
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
const Level2Select: FunctionComponent<{
  allLevel2s: STMLevel2[];
  level1Uuid: string;
  selectedLevel2Uuid: string;
  setSelectedLevel2Uuid: (uuid: string) => void;
}> = ({ allLevel2s, level1Uuid, selectedLevel2Uuid, setSelectedLevel2Uuid }) => {
  const [filteredLevel2s, setFilteredLevel2s] = useState<STMLevel2[]>([]);

  //filter down level2s
  useEffect(() => {
    const level2s = allLevel2s.filter((level2) => {
      return level2.level1Uuid === level1Uuid;
    });
    setFilteredLevel2s(level2s);
    if (!selectedLevel2Uuid) {
      if (level2s.length > 0) {
        setSelectedLevel2Uuid(level2s[0].uuid);
      } else {
        setSelectedLevel2Uuid(null);
      }
    }
  }, [allLevel2s, level1Uuid, selectedLevel2Uuid, setSelectedLevel2Uuid]);

  return (
    filteredLevel2s?.length > 0 &&
    selectedLevel2Uuid && (
      <>
        <label htmlFor="level2Select" className={stmStyles.selectLabel}>
          Select Level2
        </label>
        <select
          id="level2Select"
          onChange={(e) => setSelectedLevel2Uuid(e.target.value)}
          value={selectedLevel2Uuid}
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
const NewLevel1Fields: FunctionComponent<{
  changeMission: ChangeMission;
}> = ({ changeMission }) => {
  const [newLevel1, setNewLevel1] = useState<STMLevel1>(generateBlankStmLvl1());

  //add new level1
  function addNewLevel1() {
    const upsertRecord: STMLevel1 = {
      ...newLevel1,
      createdAt: getAccurateNow().getTime(),
      updatedAt: getAccurateNow().getTime(),
    };
    changeMission((m) => applyUpsertStmLevel(m, { collection: "stmLevel1s", level: upsertRecord }));
    setNewLevel1(generateBlankStmLvl1()); //reset to blank new object
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
        className={adminCommon.buttonPrimary}
        onClick={() => {
          addNewLevel1();
        }}
      >
        <FontAwesomeIcon icon={faPlus} /> Add New Level1
      </button>
    </>
  );
};

//Add new goal component
const NewLevel2Fields: FunctionComponent<{
  level1Uuid: string;
  changeMission: ChangeMission;
}> = ({ level1Uuid, changeMission }) => {
  const [newLevel2, setNewLevel2] = useState<STMLevel2>(generateBlankStmLvl2());

  //add new goal
  function addNewLevel2() {
    const upsertRecord: STMLevel2 = {
      ...newLevel2,
      level1Uuid: level1Uuid,
      createdAt: getAccurateNow().getTime(),
      updatedAt: getAccurateNow().getTime(),
    };
    changeMission((m) => applyUpsertStmLevel(m, { collection: "stmLevel2s", level: upsertRecord }));
    setNewLevel2(generateBlankStmLvl2()); //reset to blank new object with new uuid
  }

  return (
    level1Uuid && (
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
          className={adminCommon.buttonPrimary}
          onClick={() => {
            addNewLevel2();
          }}
        >
          <FontAwesomeIcon icon={faPlus} /> Add New Level2 to Level1
        </button>
      </>
    )
  );
};

//Add new level3 component
const NewLevel3Fields: FunctionComponent<{
  level2Uuid: string;
  changeMission: ChangeMission;
}> = ({ level2Uuid, changeMission }) => {
  const [newLevel3, setNewLevel3] = useState<STMLevel3>(generateBlankStmLvl3());

  //add new level3
  function addNewLevel3() {
    const upsertRecord: STMLevel3 = {
      ...newLevel3,
      level2Uuid: level2Uuid,
      createdAt: getAccurateNow().getTime(),
      updatedAt: getAccurateNow().getTime(),
    };
    changeMission((m) => applyUpsertStmLevel(m, { collection: "stmLevel3s", level: upsertRecord }));
    setNewLevel3(generateBlankStmLvl3());
  }

  return (
    level2Uuid && (
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
          className={adminCommon.buttonPrimary}
          onClick={() => {
            addNewLevel3();
          }}
        >
          <FontAwesomeIcon icon={faPlus} /> Add New Level3 to Level2
        </button>
      </>
    )
  );
};

export default STMEdit;
