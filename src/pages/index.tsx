import { useAppDispatch } from "utils/useAppDispatch";
import { useNavigate } from "react-router";
import type { FormEventHandler, FunctionComponent } from "react";
import { useEffect, useState } from "react";
import styles from "pages/index.module.css";
import { login, isLoggedIn, logout } from "http-client/login";
import { getMissionHomepageItems } from "http-client/mission";
import { thunkObliterateEntireStore } from "store/thunk/crossThunk";
import PetInterval from "components/page/petInterval";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faPersonWalkingArrowRight, faTv } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "react-tooltip";
import { setAppUser } from "store/user";
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import clientLogger from "utils/logging/clientLogger";

const Login = () => {
  const dispatch = useAppDispatch();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async (guest: boolean = false) => {
    let response: WrappedResponse<AppUser>;
    if (guest) {
      response = await login("guest", "guest");
    } else {
      response = await login(username, password);
    }
    if (response.status === "success") {
      setErrorMessage("");
      dispatch(
        setAppUser({
          isLoggedIn: true,
          user: response.data,
          missionPerms: null,
        })
      );
    } else {
      setErrorMessage(response.message);
      dispatch(
        setAppUser({
          isLoggedIn: false,
          user: null,
          missionPerms: null,
        })
      );
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

const Logout = () => {
  const dispatch = useAppDispatch();

  const handleLogoutButtonClick = async () => {
    const response = await logout();
    if (response.data) {
      dispatch(
        setAppUser({
          isLoggedIn: false,
          user: null,
          missionPerms: null,
        })
      );
    } else {
      // handle failing to log out? Not sure how this would happen.
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

const MissionSelect = ({ appUser }: { appUser: AppUser }) => {
  const [missionHomepageItems, setMissionHomepageItems] = useState<MissionHomepageItem[]>([]);

  useEffect(() => {
    async function populateData() {
      if (!appUser) return;

      const missionHomepageItemsRes = await getMissionHomepageItems();
      setMissionHomepageItems(missionHomepageItemsRes.data);
    }

    populateData().catch(() => {
      // Something went wrong. Eventually would like a logger here.
    });
  }, [appUser]);

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
}: {
  missionHomepageItem: MissionHomepageItem;
}) => {
  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");
  const navigate = useNavigate();

  return (
    <>
      <PetInterval
        runningRex={missionHomepageItem.runningRex}
        rexPetTime={rexPetTime}
        setRexPetTime={setRexPetTime}
      />
      <tr key={missionHomepageItem.id}>
        <td>{missionHomepageItem.name}</td>
        <td className={styles.rightFlexbox}>
          {missionHomepageItem.runningRex && (
            <>
              <div className={styles.rexWrapper}>
                <span className={styles.petTime}>{rexPetTime}</span>
                <button
                  className={`${styles.tableButton}`}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-html="View Dashbord"
                  onClick={() => {
                    navigate(`/dashboard/${missionHomepageItem.id}`);
                  }}
                >
                  <FontAwesomeIcon icon={faPersonWalkingArrowRight} size="1x" />{" "}
                  <FontAwesomeIcon icon={faTv} size="lg" />
                </button>
              </div>
            </>
          )}

          <button
            className={`${styles.tableButton} ${styles.selectButton}`}
            onClick={() => {
              navigate(`/mission/${missionHomepageItem.id}`);
            }}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-html="Go to Mission"
          >
            Select
          </button>
        </td>
      </tr>
    </>
  );
};

const Left: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const appUser = useAppSelector((state) => state.user.appUser, deepEqual);

  // Populate the user store with iron session login state via API call
  useEffect(() => {
    const isLoggedInAsync = async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        dispatch(
          setAppUser({
            isLoggedIn: true,
            user: response.data,
            missionPerms: null,
          })
        );
        // log user to the emss logging system
        clientLogger.info({
          logId: "aegis-login",
          appUsername: response.data.username,
          missionId: null,
        });
      } else {
        dispatch(
          setAppUser({
            isLoggedIn: false,
            user: null,
            missionPerms: null,
          })
        );
      }
    };
    isLoggedInAsync();
  }, [dispatch]);

  return (
    <div className={styles.left}>
      <div className={styles.leftTop}>
        <div className={styles.logo}>
          <div
            className={styles.verticalCenter}
            style={{ cursor: "pointer" }}
            onClick={() => {
              window.open(
                "https://wiki.jsc.nasa.gov/fod/index.php/Artemis_EVA_GIS",
                "_blank",
                "noopener,noreferrer"
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
                  "https://wiki.jsc.nasa.gov/fod/index.php/EVA_Mission_Systems_Software",
                  "_blank",
                  "noopener,noreferrer"
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
        {appUser ? (
          <>
            <MissionSelect appUser={appUser} />
            <Logout />
          </>
        ) : (
          <Login />
        )}
      </div>
      <div className={styles.leftBottom}>
        <div className={styles.aboutSection}>
          <div className={styles.aboutSectionTitle}>Email for Help</div>
          <ul>
            <li className={styles.link}>
              <a
                href={"mailto:JSC-DL-EMSS-AEGIS@mail.nasa.gov"}
                target={"_blank"}
                rel="noopener noreferrer"
              >
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
              <a
                href={"https://wiki.jsc.nasa.gov/fod/index.php/Artemis_EVA_GIS"}
                target={"_blank"}
                rel="noopener noreferrer"
              >
                About AEGIS
              </a>
            </li>
            <li className={styles.link}>
              <a
                href={"https://wiki.jsc.nasa.gov/fod/index.php/EVA_Mission_Systems_Software"}
                target={"_blank"}
                rel="noopener noreferrer"
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
                    <a className={styles.teamName} href={"mailto:jacob.r.keller@nasa.gov"}>
                      {" "}
                      <FontAwesomeIcon className={styles.emailIcon} icon={faEnvelope} size={"xs"} />
                      Jacob Keller
                    </a>
                  </div>
                  <div className={styles.teamTitle}>Mission Support</div>
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
      <a href="https://svs.gsfc.nasa.gov/5074" target="_blank" rel="noopener noreferrer">
        Image: Mons Mouton
        <br />
        NASA Scientific Visualization Studio
      </a>
    </div>
  );
};

const Home: React.FunctionComponent = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(thunkObliterateEntireStore());
  }, [dispatch]);

  useEffect(() => {
    document.title = "AEGIS";
  }, []);

  return (
    <>
      <div className={styles.main}>
        <Tooltip
          id="aegis-tooltip"
          className={styles.tooltip}
          clickable={true}
          delayShow={1000}
          delayHide={500}
        />
        <Left />
        <Inset />
      </div>
    </>
  );
};
export default Home;
