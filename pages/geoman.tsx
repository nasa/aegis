import type { NextPage } from "next";
import dynamic from "next/dynamic";
import styles from "./geoman.module.css";

const Geoman = dynamic(() => import("../components/geoman"), { ssr: false });

const Home: NextPage = () => {
  return (
    <div className={styles.container}>
      <Geoman />
    </div>
  );
};

export default Home;
