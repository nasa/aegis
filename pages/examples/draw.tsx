import type { NextPage } from "next";
import dynamic from "next/dynamic";
import styles from "./draw.module.css";

const Map = dynamic(() => import("components/examples/map-test"), { ssr: false });

const Home: NextPage = () => {
  return (
    <div className={styles.container}>
      <Map />
    </div>
  );
};

export default Home;
