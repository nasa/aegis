import styles from "./header.module.css";
import { useAppSelector, refEqual } from "utils/useAppSelector";
import { useRouter } from "next/router";

import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FunctionComponent } from "react";
const Header: FunctionComponent = () => {
  const router = useRouter();
  const missionName = useAppSelector((state) => state.mission.mission?.name, refEqual);
  const banner = useAppSelector((state) => state.mission.mission?.config.missionBanner, refEqual);

  return (
    <>
      <div className={styles.left}>
        <div className={styles.item}>
          <div className={styles.helpMenu}>
            <div className={styles.verticalCenter}>
              <FontAwesomeIcon
                icon={faHome}
                className={styles.homeIcon}
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
              {banner && <div className={styles.missionBanner}>{banner}</div>}
            </div>
          </div>
        </div>
      </div>
      <div className={styles.right}>
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
            title="More info about EVA Mission System Software (EMSS)"
          >
            <span className={styles.logoEmss} />
          </div>
        </div>
      </div>
    </>
  );
};

export default Header;
