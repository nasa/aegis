import dynamic from "next/dynamic";
import styles from "./main.module.css";

const MapBody = dynamic(import("components/interface/map-test"), {
  ssr: false,
});

export default function Page() {
  return (
    <div className={styles.page}>
      <div className={styles.body}>
        <div className={styles.mapBody}>
          <MapBody />
        </div>
      </div>
    </div>
  );
}
