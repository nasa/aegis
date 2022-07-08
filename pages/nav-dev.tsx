import type { NextPage } from "next";
import styles from "./nav-dev.module.css";

import dynamic from "next/dynamic";
/** Dynamically import the whole framework because nothing likes NextJS */
const LeftControlPanel = dynamic(import("components/left-control"), {
  ssr: false,
});
const RightControlPanel = dynamic(import("components/right-control"), {
  ssr: false,
});
const MapBody = dynamic(import("components/map-body"), {
  ssr: false,
});
const Header = dynamic(import("components/header"), {
  ssr: false,
});

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
