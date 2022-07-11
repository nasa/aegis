import type { NextPage } from "next";
import { useState } from "react";
import styles from "./mmgis_api_test.module.css";

const APICall: NextPage = () => {
  const [loginResults, setLoginResults] = useState(null);
  const [missions, setMissions] = useState(null);
  const [mission, setMission] = useState(null);

  async function login() {
    const apiLoginUrl = "http://localhost:8889/api/users/login";

    // perform a post fetch request to the api
    const res = await fetch(apiLoginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "admin",
        email: "admin@domain.com",
        password: "admin",
        retypepassword: "admin",
        mission: "Postrillo_VF_v001",
        master: false,
      }),
    });
    if (!res.ok) {
      const message = `An error occured: ${res.status}`;
      throw new Error(message);
    }

    const data = await res.json();
    setLoginResults(JSON.stringify(data));
  }

  async function getMissions() {
    const apiMissionUrl = "http://localhost:8889/api/configure/missions";

    const res = await fetch(apiMissionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const message = `An error occured: ${res.status}`;
      throw new Error(message);
    }

    const data = await res.json();
    setMissions(data);
  }

  async function getMission(missionName: string) {
    const apiMissionUrl = `http://localhost:8889/api/configure/get?mission=${missionName}`;

    const res = await fetch(apiMissionUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const message = `An error occured: ${res.status}`;
      throw new Error(message);
    }

    const data = await res.json();
    setMission(data);
  }

  return (
    <div>
      <div className={styles.container}>
        <button onClick={() => login()}>Login</button>
        <div className={styles.loginRes}>{loginResults}</div>
      </div>
      <div className={styles.container}>
        <button onClick={() => getMissions()}>getMissions</button>
        <div className={styles.missionsRes}>{JSON.stringify(missions)}</div>
      </div>
      <div className={styles.container}>
        {missionButtons()}
        {missionHierarchy()}
        <div className={styles.missionRes}>{JSON.stringify(mission)}</div>
      </div>
    </div>
  );

  function missionButtons() {
    if (!missions) return;
    return missions.missions.map((mission: string) => {
      return (
        <button key={mission} onClick={() => getMission(mission)}>
          {mission}
        </button>
      );
    });
  }

  function missionHierarchy() {
    if (!mission) return;
    const layers = mission.layers;

    // show an indented ul of the mission layers and sublayers
    return (
      <ul>
        {layers.map((layer: any) => {
          return (
            <li key={layer.name}>
              {layer.name}
              {layer.sublayers && (
                <ul>
                  {layer.sublayers.map((sublayer: any) => {
                    return (
                      <li key={sublayer.name}>
                        {sublayer.name} ({sublayer.type})
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    );
  }
};

export default APICall;
