import styles from "./header.module.css";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import { useRouter } from "next/router";

import { faBars, faPen, faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FunctionComponent } from "react";
const Header: FunctionComponent = () => {
  const router = useRouter();
  const missionName = useAppSelector((state) => state.mission.mission?.name, refEqual);
  const banner = useAppSelector((state) => state.mission.mission?.missionBanner, refEqual);
  const visitorCounts = useAppSelector((state) => state.interface.visitorCounts, shallowEqual);

  return (
    <>
      <div className={styles.left}>
        <div className={styles.item}>
          <div className={styles.helpMenu}>
            <div className={styles.verticalCenter}>
              <FontAwesomeIcon
                icon={faBars}
                className={styles.icon}
                onClick={() => {
                  router.push("/");
                }}
                size="lg"
              />
            </div>
          </div>
        </div>
        <div className={styles.item}>
          <div className={styles.mission}>
            <div className={styles.verticalCenter}>
              <div className={styles.headerTextItem}>{missionName}</div>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.center}>
        <div className={styles.item}>
          <div className={styles.missionBanner}>
            <div className={styles.verticalCenter}>
              {banner && <div className={styles.missionBanner}>{banner}</div>}
            </div>
          </div>
        </div>
      </div>
      <div className={styles.right}>
        <div className={styles.verticalCenter}>
          <div
            className={styles.userCount}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-html={
              `Users active in this Mission:<br>` +
              `Editors: ${visitorCounts?.editors || 0}<br>` +
              `Visitors: ${visitorCounts?.visitors || 0}<br>` +
              `These numbers include you.`
            }
          >
            <FontAwesomeIcon icon={faPen} className={styles.icon} />
            <div className={styles.userCountText}>{visitorCounts?.editors || 0}</div>
            <FontAwesomeIcon icon={faUser} className={styles.icon} style={{ marginLeft: "6px" }} />
            <div className={styles.userCountText}>{visitorCounts?.visitors || 0}</div>
          </div>
        </div>
        <div className={styles.verticalCenter}>
          <span className={styles.wordMark}>AEGIS</span>
        </div>
        <div className={styles.logoRight}>
          <div>
            <img className={styles.meatball} src="/images/logo_NASA.svg" alt="NASA meatball" />
          </div>
          <div
            className={styles.logoEmssWrapper}
            onClick={() => {
              window.open(
                "https://wiki.jsc.nasa.gov/exploration/index.php/EVA_Mission_System_Software",
                "_blank"
              );
            }}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-html="More info about EVA Mission System Software (EMSS)"
          >
            <span className={styles.logoEmss} />
          </div>
        </div>
      </div>
    </>
  );
};

export default Header;
