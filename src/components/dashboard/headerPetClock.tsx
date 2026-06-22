import type { FunctionComponent } from "react";
import { useState } from "react";
import styles from "./headerPetClock.module.css";
import PetInterval from "components/page/petInterval";
import { useMissionDocSelector } from "utils/useDocSelector";
import { deepEqual } from "utils/useAppSelector";

const DashboardPETClock: FunctionComponent = () => {
  const runningRex = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return null;
    return Object.values(mission.rexes).find((rex) => rex.isRunning) ?? null;
  }, deepEqual);
  const [rexPetTime, setRexPetTime] = useState("");
  return (
    <>
      <PetInterval runningRex={runningRex} rexPetTime={rexPetTime} setRexPetTime={setRexPetTime} />
      <div className={styles.petClock}>
        <div className={styles.petClockTextContainer}>
          <span className={styles.petClockLabel}>PET</span>
          <span className={styles.petClockValue}>{rexPetTime}</span>
        </div>
      </div>
    </>
  );
};

export default DashboardPETClock;
