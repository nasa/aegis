import styles from "./header.module.css";
import { useSelector } from "react-redux";
import { useRouter } from "next/router";

import { faBars } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { RootState } from "store";
import { FunctionComponent } from "react";

const Header: FunctionComponent = () => {
  const router = useRouter();
  const missionPage = useSelector((state: RootState) => state.missionSlice);

  return (
    <>
      <div className={styles.left}>
        <div className={styles.item}>
          <div className={styles.helpMenu}>
            <div className={styles.verticalCenter}>
              <FontAwesomeIcon
                icon={faBars}
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
            <div
              className={styles.verticalCenter}
              style={{ display: "flex", flexDirection: "row" }}
            >
              <div className={styles.headerTextItem}>{missionPage?.Mission?.name}</div>
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
            <span className={styles.logoEmss}></span>
          </div>
        </div>
      </div>
    </>
  );
};

export default Header;
