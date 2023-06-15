import type { NextPage } from "next";
import { useDispatch } from "react-redux";
import { useAppSelector, refEqual } from "utils/useAppSelector";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import styles from "./index.module.css";
import { login, isLoggedIn, logout } from "http-client/login";
import { getMissions } from "http-client/mission";
import { clearIronSessionData, setIronSessionData, setIsLoggedIn } from "store/user";
import { useAppDispatch } from "utils/useAppDispatch";
import { obliterateEntireStore } from "store/cross-slice";

const Head = dynamic(import("next/head"), {
  ssr: false,
});

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const dispatch = useAppDispatch();

  const handleLoginButtonClick = async () => {
    const response = await login(username, password);
    if (response.status === "success") {
      dispatch(setIsLoggedIn(true));
      dispatch(setIronSessionData(response.data));
      setErrorMessage("");
    } else {
      dispatch(setIsLoggedIn(false));
      dispatch(clearIronSessionData());
      setErrorMessage(response.message);
    }
  };

  const handleGuestLogin = async () => {
    const username = "guest";
    const password = "guest";

    const response = await login(username, password);
    if (response.status === "success") {
      dispatch(setIsLoggedIn(true));
      dispatch(setIronSessionData(response.data));
      setErrorMessage("");
    } else {
      dispatch(setIsLoggedIn(false));
      dispatch(clearIronSessionData());
      setErrorMessage(response.message);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
  };

  return (
    <>
      <input
        type="button"
        value={"Login as Guest"}
        className={styles.guestButton}
        onClick={handleGuestLogin}
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
              handleLoginButtonClick();
            }}
          >
            Login
          </button>
        </div>
      </form>
    </>
  );
};

const MissionSelect = () => {
  const dispatch = useDispatch();
  const router = useRouter();

  const [missions, setmissions] = useState<Mission[]>([]);

  useEffect(() => {
    (async () => {
      const response = await getMissions();
      setmissions(response.data);
    })();
  }, []);

  const handleLogoutButtonClick = async () => {
    const response = await logout();
    if (response.data) {
      dispatch(setIsLoggedIn(false));
      dispatch(clearIronSessionData());
    }
  };

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
      <div className={styles.login}>
        <div className={styles.loginFormField}>
          <button className={styles.logoutButton} onClick={handleLogoutButtonClick}>
            Logout
          </button>
        </div>
      </div>
    </>
  );
};

const Left = () => {
  const userIsLoggedIn = useAppSelector((state) => state.user.isLoggedIn, refEqual);
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
        {userIsLoggedIn ? <MissionSelect /> : <Login />}
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
                    <a className={styles.teamName} href={"mailto:cameron.w.pittman@nasa.gov"}>
                      Cameron Pittman
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
  const dispatch = useDispatch();

  // Populate the user store with iron session login state via API call
  useEffect(() => {
    dispatch(obliterateEntireStore());
    (async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        dispatch(setIsLoggedIn(true));
        dispatch(setIronSessionData(response.data));
      } else {
        dispatch(setIsLoggedIn(false));
        dispatch(clearIronSessionData());
      }
    })();
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
