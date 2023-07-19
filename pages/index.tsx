import type { NextPage } from "next";
import { useAppDispatch } from "utils/useAppDispatch";

import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { Dispatch, FormEventHandler, SetStateAction, useEffect, useState } from "react";
import styles from "./index.module.css";
import { login, isLoggedIn, logout } from "http-client/login";
import { getMissions } from "http-client/mission";
import { obliterateEntireStore } from "store/cross-slice";
import { IronSessionData } from "iron-session";

const Head = dynamic(import("next/head"), {
  ssr: false,
});

const Login = ({ setUser }: { setUser: Dispatch<SetStateAction<User>> }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async (guest: boolean = false) => {
    let response: WrappedResponse<IronSessionData>;
    if (guest) {
      response = await login("guest", "guest");
    } else {
      response = await login(username, password);
    }
    if (response.status === "success") {
      setErrorMessage("");
      setUser(response.data.user);
    } else {
      setErrorMessage(response.message);
      setUser(null);
    }
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
  };

  return (
    <>
      <input
        type="button"
        value={"Login as Guest"}
        className={styles.guestButton}
        onClick={() => handleLogin(true)}
      />
      <div className={styles.title}>Login to AEGIS</div>
      <form className={styles.login} onSubmit={handleSubmit}>
        <div className={styles.errorMessage}>{errorMessage}</div>
        <div className={styles.loginFormField}>
          <label htmlFor="usernameField" className={styles.loginFormLabel}>
            Username
          </label>
          <input
            id="usernameField"
            className={styles.loginFormInput}
            type="text"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
            }}
          />
        </div>
        <div className={styles.loginFormField}>
          <label htmlFor="passwordField" className={styles.loginFormLabel}>
            Password
          </label>
          <input
            id="passwordField"
            className={styles.loginFormInput}
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </div>
        <div className={styles.loginFormField}>
          <button
            className={styles.loginFormButton}
            type={"submit"}
            onClick={() => {
              handleLogin();
            }}
          >
            Login
          </button>
        </div>
      </form>
    </>
  );
};

const Logout = ({ setUser }: { setUser: Dispatch<SetStateAction<User>> }) => {
  const handleLogoutButtonClick = async () => {
    const response = await logout();
    if (response.data) {
      setUser(null);
    }
  };

  return (
    <div className={styles.login}>
      <div className={styles.loginFormField}>
        <button className={styles.logoutButton} onClick={handleLogoutButtonClick}>
          Logout
        </button>
      </div>
    </div>
  );
};

const MissionSelect = ({ user }: { user: User }) => {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);

  useEffect(() => {
    async function populateData() {
      if (!user) return;

      const missionRes = await getMissions();
      // if superadmin, show everything
      if (user.isSuperAdmin) {
        setMissions(missionRes.data);
        return;
      }

      // Filter out missions that the user does not have permission to view
      const permissionList: Permission[] = user.permissionList;
      const filteredMissions = missionRes.data.filter((mission) => {
        return permissionList.some((permission) => {
          // Check if they can view
          return permission.missionId === mission.id && permission.permissions.view === true;
        });
      });
      setMissions(filteredMissions);
    }

    populateData().catch(() => {
      // Something went wrong. Eventually would like a logger here.
    });
  }, [user]);

  const handleMissionSelectClick = (missionId: number) => {
    router.push(`/mission/${missionId}`);
  };

  return (
    <>
      <div className={styles.title}>Select a Mission</div>
      <div>
        <div className={`${styles.container}`}>
          <table className={styles.table}>
            <tbody>
              <tr>
                <td>Project Name</td>
                <td>Version</td>
                <td>Last Edited</td>
                <td />
              </tr>

              {missions &&
                missions.map((mission) => {
                  return (
                    <tr key={mission.id}>
                      <td>{mission.name}</td>
                      <td>{mission.version}</td>
                      <td>
                        {new Date(mission.createdAt).toLocaleDateString()}{" "}
                        {new Date(mission.createdAt).toLocaleTimeString()}
                      </td>
                      <td>
                        <button
                          className={styles.tableButton}
                          onClick={() => {
                            handleMissionSelectClick(mission.id);
                          }}
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

const Left = () => {
  const [user, setUser] = useState<User>(null);

  // Populate the user store with iron session login state via API call
  useEffect(() => {
    (async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        setUser(response.data.user);
      } else {
        setUser(null);
      }
    })();
  }, []);

  return (
    <div className={styles.left}>
      <div className={styles.leftTop}>
        <div className={styles.logo}>
          <div
            className={styles.verticalCenter}
            style={{ cursor: "pointer" }}
            onClick={() => {
              window.open(
                "https://wiki.jsc.nasa.gov/exploration/index.php/Artemis_EVA_Geographic_Information_System",
                "_blank"
              );
            }}
          >
            <span className={styles.wordMark}>AEGIS</span>
          </div>
          <div className={styles.logoRight}>
            <img className={styles.meatball} src="/images/logo_NASA.svg" alt="NASA meatball" />
            <div
              className={styles.logoEmssWrapper}
              onClick={() => {
                window.open(
                  "https://wiki.jsc.nasa.gov/exploration/index.php/EVA_Mission_System_Software",
                  "_blank"
                );
              }}
            >
              <span className={styles.logoEmss} />
            </div>
          </div>
        </div>
        <div className={styles.description}>
          <div className={styles.strong}>Artemis EVA Geographic Information System</div>
          <p>
            Making maps meaningful and useful for EVA. <br />A collaboration between JSC XI, CX, SK
            and JPL.
          </p>
        </div>
        {user ? (
          <>
            <MissionSelect user={user} />
            <Logout setUser={setUser} />
          </>
        ) : (
          <Login setUser={setUser} />
        )}
      </div>
      <div className={styles.leftBottom}>
        <div className={styles.aboutSection}>
          <div className={styles.aboutSectionTitle}>Useful Links</div>
          <ul>
            <li>
              <a href={"https://wiki.jsc.nasa.gov/fod/index.php/Artemis_EVA_GIS"} target={"_blank"}>
                About AEGIS
              </a>
            </li>
            <li>
              <a
                href={"https://wiki.jsc.nasa.gov/fod/index.php/EVA_Mission_Systems_Software"}
                target={"_blank"}
              >
                About the EMSS effort
              </a>
            </li>
          </ul>
        </div>
        <div className={`${styles.aboutSection} ${styles.theTeam}`}>
          <div className={styles.aboutSectionTitle}>The Team</div>
          <div className={styles.theTeamMembers}>
            <div className={styles.theTeamSegment}>
              <ul className={styles.theTeamUl}>
                <li>
                  <div>
                    <a className={styles.teamName} href={"mailto:benjamin.f.feist@nasa.gov"}>
                      Ben Feist
                    </a>
                  </div>
                  <div className={styles.teamTitle}>
                    Software Engineering
                    <br />
                    <a className={styles.smallText} href={"mailto:benjamin.f.feist@nasa.gov"}>
                      Email for help
                    </a>
                  </div>
                </li>
                <li>
                  <div className={styles.creditHeading}>
                    <a className={styles.teamName} href={"mailto:jackie.vu@nasa.gov"}>
                      Jackie Vu
                    </a>
                  </div>
                  <div className={styles.teamTitle}>Software Engineering</div>
                </li>
                <li>
                  <div className={styles.creditHeading}>
                    <a className={styles.teamName} href={"mailto:david.w.charney@nasa.gov"}>
                      David Charney
                    </a>
                  </div>
                  <div className={styles.teamTitle}>Interaction and Visual Design</div>
                </li>
                <li>
                  <div className={styles.creditHeading}>
                    <a className={styles.teamName} href={"mailto:omar.a.baig@nasa.gov"}>
                      Omar Baig
                    </a>
                  </div>
                  <div className={styles.teamTitle}>Software Engineering</div>
                </li>
              </ul>
            </div>
            <div className={styles.theTeamSegment}>
              <ul className={styles.theTeamUl}>
                <li>
                  <div className={styles.creditHeading}>
                    <a className={styles.teamName} href={"mailto:matthew.j.miller-1@nasa.gov"}>
                      Matthew Miller
                    </a>
                  </div>
                  <div className={styles.teamTitle}>
                    Project Management,
                    <br />
                    Concept Design
                  </div>
                </li>
                <li>
                  <div className={styles.creditHeading}>
                    <a className={styles.teamName} href={"mailto:david.c.rynearson@nasa.gov"}>
                      David Rynearson
                    </a>
                  </div>
                  <div className={styles.teamTitle}>Software Engineering</div>
                </li>
                <li>
                  <div className={styles.creditHeading}>
                    <a className={styles.teamName} href={"mailto:luke.a.mcsherry@nasa.gov"}>
                      Luke McSherry
                    </a>
                  </div>
                  <div className={styles.teamTitle}>Software Engineering</div>
                </li>
                <li>
                  <div className={styles.creditHeading}>
                    <a className={styles.teamName} href={"mailto:edwin.j.montalvo@nasa.gov"}>
                      James Montalvo
                    </a>
                  </div>
                  <div className={styles.teamTitle}>EMSS Lead</div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Inset: React.FunctionComponent = () => {
  return (
    <div className={styles.insetContainer}>
      <a href="https://svs.gsfc.nasa.gov/5074" target="_blank" rel="noopener">
        Image: Mons Mouton
        <br />
        NASA Scientific Visualization Studio
      </a>
    </div>
  );
};

const Home: NextPage = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(obliterateEntireStore());
  }, [dispatch]);

  return (
    <>
      <Head>
        <title>AEGIS</title>
      </Head>
      <div className={styles.main}>
        <Left />
        <Inset />
      </div>
    </>
  );
};
export default Home;
