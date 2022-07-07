import type { NextPage } from "next";
import dynamic from "next/dynamic";
import styles from "./nav-dev.module.css";
import LeftControlPanel from "components/left-control";
import RightControlPanel from "components/right-control";
import MapBody from "components/map-body";
import Header from "components/header";

const Home: NextPage = () => {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Header />
      </div>
      <div className={styles.body}>
        <div className={styles.leftControl}>
          <LeftControlPanel />
        </div>
        <div className={styles.mapBody}>
          <MapBody />
        </div>
        <div className={styles.rightControl}>
          <RightControlPanel />
        </div>
      </div>
      <div className={styles.timeline}>Timeline</div>
    </div>
  );
};

export default Home;
