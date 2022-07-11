import type { NextPage } from "next";
import dynamic from "next/dynamic";
import styles from "./index.module.css";

const Map = dynamic(() => import("../components/react-leaflet"), { ssr: false });

const Home: NextPage = () => {
  return (
    <div className={styles.container}>
      <Map />
    </div>
  );
};

export default Home;
