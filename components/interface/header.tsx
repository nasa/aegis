import styles from "./header.module.css";
import { useSelector } from "react-redux";
import { useRouter } from "next/router";

import { library } from "@fortawesome/fontawesome-svg-core";
import { faBars } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { RootState } from "store";
import { FunctionComponent } from "react";
library.add(faBars);

const Header: FunctionComponent = () => {
  const router = useRouter();
  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig);

  return (
    <>
      <div className={styles.left}>
        <div className={styles.item}>
          <div className={styles.helpMenu}>
            <div className={styles.verticalCenter}>
              <FontAwesomeIcon
                icon="bars"
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
              <div className={styles.headerTextItem}>{mmgisConfig?.MMGISConfig?.mission}</div>
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
