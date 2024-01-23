import type { NextPage } from "next";
import { useAppDispatch } from "utils/useAppDispatch";

import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import {
  Dispatch,
  FormEventHandler,
  FunctionComponent,
  SetStateAction,
  useEffect,
  useState,
} from "react";
import styles from "./index.module.css";
import { login, isLoggedIn, logout } from "http-client/login";
import { getMissionHomepageItems } from "http-client/mission";
import { obliterateEntireStore } from "store/cross-slice";
import { IronSessionData } from "iron-session";
import _ from "lodash";
import PetInterval from "components/interface/page/petInterval";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope } from "@fortawesome/free-solid-svg-icons";

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
  const [missionHomepageItems, setMissionHomepageItems] = useState<MissionHomepageItem[]>([]);

  useEffect(() => {
    async function populateData() {
      if (!user) return;

      const missionHomepageItemsRes = await getMissionHomepageItems();
      setMissionHomepageItems(missionHomepageItemsRes.data);
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
              {missionHomepageItems &&
                missionHomepageItems.map((missionHomepageItem) => {
                  return (
                    <MissionHomepageItem
                      key={missionHomepageItem.id}
                      missionHomepageItem={missionHomepageItem}
                      handleMissionSelectClick={handleMissionSelectClick}
                    />
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

const MissionHomepageItem = ({
  missionHomepageItem,
  handleMissionSelectClick,
}: {
  missionHomepageItem: MissionHomepageItem;
  handleMissionSelectClick: (missionId: number) => void;
}) => {
  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");

  return (
    <>
      <PetInterval
        runningRex={missionHomepageItem.runningRex}
        rexPetTime={rexPetTime}
        setRexPetTime={setRexPetTime}
      />
      <tr key={missionHomepageItem.id}>
        <td>{missionHomepageItem.name}</td>
        {missionHomepageItem.runningRex ? (
          <td>
            EVA Executing
            <br />
            <span className={styles.petTime}>{rexPetTime}</span> PET
          </td>
        ) : (
          <td></td>
        )}
        <td>
          <button
            className={styles.tableButton}
            onClick={() => {
              handleMissionSelectClick(missionHomepageItem.id);
            }}
          >
            Select
          </button>
        </td>
      </tr>
    </>
  );
};

const Left: FunctionComponent = () => {
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
            Exploration EVA planning and execution tool. <br />A collaboration between JSC XI, CX,
            SK.
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
          <div className={styles.aboutSectionTitle}>Email for Help</div>
          <ul>
            <li className={styles.link}>
              <a href={"mailto:JSC-DL-EMSS-AEGIS@mail.nasa.gov"} target={"_blank"}>
                <FontAwesomeIcon className={styles.emailIconDistro} icon={faEnvelope} size={"xs"} />
                Team Distro List
              </a>
            </li>
          </ul>
          <div style={{ marginTop: "10px" }} className={styles.aboutSectionTitle}>
            Useful Links
          </div>
          <ul>
            <li className={styles.link}>
              <a href={"https://wiki.jsc.nasa.gov/fod/index.php/Artemis_EVA_GIS"} target={"_blank"}>
                About AEGIS
              </a>
            </li>
            <li className={styles.link}>
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
                      <FontAwesomeIcon className={styles.emailIcon} icon={faEnvelope} size={"xs"} />
                      Ben Feist
                    </a>
                  </div>
                  <div className={styles.teamTitle}>
                    Software Engineering Lead
                    <br />
                  </div>
                </li>
                <li>
                  <div className={styles.creditHeading}>
                    <a className={styles.teamName} href={"mailto:jackie.vu@nasa.gov"}>
                      <FontAwesomeIcon className={styles.emailIcon} icon={faEnvelope} size={"xs"} />
                      Jackie Vu
                    </a>
                  </div>
                  <div className={styles.teamTitle}>Software Engineering</div>
                </li>
                <li>
                  <div className={styles.creditHeading}>
                    <a className={styles.teamName} href={"mailto:luke.a.mcsherry@nasa.gov"}>
                      {" "}
                      <FontAwesomeIcon className={styles.emailIcon} icon={faEnvelope} size={"xs"} />
                      Luke McSherry
                    </a>
                  </div>
                  <div className={styles.teamTitle}>Software Engineering</div>
                </li>
                <li>
                  <div className={styles.creditHeading}>
                    <a className={styles.teamName} href={"mailto:omar.a.baig@nasa.gov"}>
                      {" "}
                      <FontAwesomeIcon className={styles.emailIcon} icon={faEnvelope} size={"xs"} />
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
                      {" "}
                      <FontAwesomeIcon className={styles.emailIcon} icon={faEnvelope} size={"xs"} />
                      Matthew Miller
                    </a>
                  </div>
                  <div className={styles.teamTitle}>Project Management, Concept</div>
                </li>
                <li>
                  <div className={styles.creditHeading}>
                    <a className={styles.teamName} href={"mailto:david.w.charney@nasa.gov"}>
                      {" "}
                      <FontAwesomeIcon className={styles.emailIcon} icon={faEnvelope} size={"xs"} />
                      David Charney
                    </a>
                  </div>
                  <div className={styles.teamTitle}>Interaction and Visual Design</div>
                </li>

                <li>
                  <div className={styles.creditHeading}>
                    <a className={styles.teamName} href={"mailto:edwin.j.montalvo@nasa.gov"}>
                      {" "}
                      <FontAwesomeIcon className={styles.emailIcon} icon={faEnvelope} size={"xs"} />
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

const Inset: FunctionComponent = () => {
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
