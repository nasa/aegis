import { useAppDispatch } from "utils/useAppDispatch";
import { useNavigate } from "react-router";
import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";
import styles from "pages/index.module.css";
import { getCurrentUserAndAccess } from "http-client/access/currentUser";
import { getMissionHomepageItems } from "http-client/mission";
import { thunkObliterateMissionSpecificData } from "store/thunk/crossThunk";
import PetInterval from "components/page/petInterval";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faPersonWalkingArrowRight, faTv } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "react-tooltip";
import aegisTooltipStyles from "styles/aegis-tooltip.module.css";
import { setAppUserId, setLaunchpadUser } from "store/user";
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import { clientLogger } from "utils/logging/clientLogger";
import isEqual from "lodash/isEqual";

const MissionSelect = ({ launchpadUser }: { launchpadUser: LaunchpadUser }) => {
  const [missionHomepageItems, setMissionHomepageItems] = useState<MissionHomepageItem[]>([]);

  useEffect(() => {
    async function populateMissionHomepage() {
      if (!launchpadUser) return;

      const missionHomepageItemsRes = await getMissionHomepageItems();
      setMissionHomepageItems(missionHomepageItemsRes.data ?? []);
    }

    populateMissionHomepage().catch((e) => {
      clientLogger.error(
        {
          logId: "populateMissionHomepage",
          logValue: "Error in populateMissionHomepage on index.tsx",
        },
        e
      );
    });
  }, [launchpadUser]);

  return (
    <div className={styles.missionSelect}>
      {missionHomepageItems.length > 0 ? (
        <>
          <div className={styles.title}>Select a Mission</div>
          <div className={`${styles.container}`}>
            <table className={styles.table}>
              <tbody>
                {missionHomepageItems.map((missionHomepageItem) => {
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
        </>
      ) : (
        <div className={styles.title}>No Missions Available</div>
      )}
    </div>
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
                  data-tooltip-content="View Dashboard"
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
            data-tooltip-content="Go to Mission"
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
  const launchpadUser = useAppSelector((state) => state.user.launchpadUser, deepEqual);

  // Identity comes from the SSO token, so there is no login step. Every caller reaching this page
  // is already authenticated; the mission list they see is their grants plus the public baseline.
  useEffect(() => {
    const getUserLoginInfo = async () => {
      const access = await getCurrentUserAndAccess();
      if (access instanceof Error) return;

      dispatch(setLaunchpadUser(access.launchpadUser));
      dispatch(setAppUserId(access.appUser?.id ?? null));

      clientLogger.info({
        logId: "appLogin",
        appUsername: access.launchpadUser.auid,
        missionId: null,
        page: "home",
      });
    };
    getUserLoginInfo();
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
            <button
              type="button"
              className={styles.logoEmssWrapper}
              onClick={() => {
                window.open(
                  "https://wiki.jsc.nasa.gov/fod/index.php/EVA_Mission_Systems_Software",
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
              aria-label="More information about Exploration Mission Systems Software"
            >
              <span className={styles.logoEmss} />
            </button>
          </div>
        </div>
        <div className={styles.description}>
          <div className={styles.strong}>
            Application for Exploration Geospatial Integration and Scheduling
          </div>
          <p>
            Exploration EVA planning and execution tool. <br />A collaboration between JSC XI, CX,
            SK.
          </p>
        </div>
        {launchpadUser && <MissionSelect launchpadUser={launchpadUser} />}
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

  // clear mission specific data from store
  useEffect(() => {
    dispatch(thunkObliterateMissionSpecificData());
  }, [dispatch]);

  // check the app version
  const clientAppVersion = useAppSelector((state) => state.connection.clientAppVersion, deepEqual);
  useEffect(() => {
    const checkVersion = async () => {
      const res = await fetch(`/api/v1/version?_=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.status !== 200) {
        console.warn(`Unable to check app version: ${res.status} ${res.statusText}`);
        return;
      } else {
        const serverAppVersion: AppVersion = await res.json();
        if (!isEqual(clientAppVersion, serverAppVersion)) {
          alert(
            `AEGIS has been updated or restarted. You will be redirected to a version check page. \nCurrent version: ${clientAppVersion.version}/${clientAppVersion.gitCommit}/${clientAppVersion.serverEpochUuid}\nNew version: ${serverAppVersion.version}/${serverAppVersion.gitCommit}/${serverAppVersion.serverEpochUuid}`
          );
          // Redirect to version check page with version info and return URL
          const currentUrl = window.location.pathname + window.location.search;
          window.location.href = `/versionCheck?returnUrl=${encodeURIComponent(currentUrl)}`;
        }
      }
    };
    checkVersion();
  }, [clientAppVersion]);

  useEffect(() => {
    document.title = "AEGIS";
  }, []);

  return (
    <>
      <div className={styles.main}>
        <Tooltip
          id="aegis-tooltip"
          className={aegisTooltipStyles.tooltip}
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
