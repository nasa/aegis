import { NextPage } from "next";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isLoggedIn } from "http-client/internal-api";
import { getMissions, deleteMission, upsertMission } from "http-client/mission";
import Link from "next/link";
import _ from "lodash";
import MSV from "components/admin/msv";
import Tools from "components/admin/tools";
import Projection from "components/admin/projection";
import Look from "components/admin/look";
import Panels from "components/admin/panels";
import Time from "components/admin/time";
import styles from "components/admin/admin.module.css";
import { createNewConfig } from "components/admin/helper";

const Index: NextPage = () => {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [editMissionId, setEditMissionId] = useState<number>(); //track mission currently in edit

  async function loadMissionsFromDB() {
    const missionList = (await getMissions()).data;
    setMissions(missionList);
  }

  //on load check login and mission id
  useEffect(() => {
    (async () => {
      const response = await isLoggedIn(); //check user is logged in
      if (response.status !== "success") {
        router.push("/"); //user is not logged in. Redirect to homepage
      }

      loadMissionsFromDB();
    })();
  }, [router]);

  return (
    <div>
      <Link href="/admin/upload">Upload Files</Link>
      <h3>Missions</h3>
      <MissionList
        missions={missions}
        refreshMissionList={loadMissionsFromDB}
        setEditMissionId={setEditMissionId}
      />
      <button
        type="button"
        onClick={() => {
          setEditMissionId(null);
        }}
      >
        Add New Mission (Clear Form)
      </button>
      <AddEditMission refreshMissionList={loadMissionsFromDB} editMissionId={editMissionId} />
    </div>
  );
};

//component to display the bulleted list of missions
const MissionList = (props: {
  missions: Mission[];
  refreshMissionList: () => {};
  setEditMissionId: Dispatch<SetStateAction<Number>>;
}) => {
  const router = useRouter();

  async function delMission(id: number) {
    if (confirm("Are you sure you want to delete mission " + id)) {
      const res: WrappedResponse<number> = await deleteMission(id);
      alert(`Delete ${res.status} - ${res.message} for missionID ${id}`);
      props.refreshMissionList(); //reload mission listing in parent component.
    }
  }

  if (props.missions?.length > 0) {
    return (
      <ul>
        {props.missions.map((mission: Mission) => {
          return (
            <li key={mission.id}>
              <>
                {mission.name} (v{mission.version})<br />
                <button
                  type="button"
                  onClick={() => {
                    props.setEditMissionId(mission.id);
                  }}
                >
                  Edit Mission
                </button>
                &nbsp;
                <button
                  type="button"
                  onClick={() => {
                    router.push(`admin/layers/${mission.id}`);
                  }}
                >
                  Edit Layers
                </button>
                &nbsp;
                <button
                  type="button"
                  onClick={() => {
                    router.push(`admin/stm/${mission.id}`);
                  }}
                >
                  Edit STM
                </button>
                &nbsp;
                <button
                  className={styles.deleteButton}
                  type="button"
                  onClick={() => {
                    delMission(mission.id);
                  }}
                >
                  Delete Mission
                </button>
              </>
            </li>
          );
        })}
      </ul>
    );
  } else {
    return <div>No missions found</div>;
  }
};

//Add new mission components
const AddEditMission = (props: { refreshMissionList: () => {}; editMissionId?: number }) => {
  const [mission, setMission] = useState<Mission>({ name: "", config: null }); //current mission being edited, or a blank mission if we're adding new
  const [config, setConfig] = useState<Config>(createNewConfig());

  useEffect(() => {
    if (props.editMissionId) {
      loadMission(props.editMissionId);
    } else {
      loadMission(null);
    }
  }, [props.editMissionId]);

  //loads mission data into form for edit
  async function loadMission(missionId: number) {
    if (missionId) {
      //get mission data from DB
      const missions: WrappedResponse<Mission[]> = await getMissions(missionId);
      if (!missions.data || missions.data?.length !== 1) {
        alert(missions.message);
        return;
      }

      //load up all the component editors with mission data
      setMission(missions.data[0]);
      setConfig(missions.data[0].config);
    } else {
      //clear all component editors
      setMission({ name: "", config: null });
      setConfig(createNewConfig());
    }
  }

  //save the mission and call and upsert
  async function saveMission() {
    const missionToSave: Mission = { ...mission, config: config };
    const res = await upsertMission(missionToSave);
    if (res.status === "success") {
      props.refreshMissionList();
    }
    alert(`${res.status} - ${res.message}`);
  }

  return (
    <div>
      <h3>Add/Edit Mission</h3>
      <button
        type="button"
        onClick={() => {
          saveMission();
        }}
      >
        Save Mission
      </button>
      <br />
      <br />
      <div id="missionDiv">
        <div className={styles.editDiv}>
          <label htmlFor="newName">Mission Name (Parent)</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="newName"
            type="text"
            onChange={(e) => {
              setMission({ ...mission, name: e.target.value });
            }}
            value={mission?.name}
          />
        </div>
      </div>
      <MSV config_msv={config?.msv} setConfig={setConfig} />
      <Tools config_tools={config?.tools} setConfig={setConfig} />
      <Projection config_projection={config?.projection} setConfig={setConfig} />
      <Look config_look={config?.look} setConfig={setConfig} />
      <Panels
        config_panels={config?.panels}
        config_panelSettings={config?.panelSettings}
        setConfig={setConfig}
      />
      <Time config_time={config?.time} setConfig={setConfig} />
    </div>
  );
};

export default Index;
