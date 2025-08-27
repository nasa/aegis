import { FunctionComponent, useState } from "react";
import styles from "./headerPetClock.module.css";
import PetInterval from "components/page/petInterval";
import { useAppSelector, deepEqual } from "utils/useAppSelector";

const DashboardPETClock: FunctionComponent = () => {
  const runningRex = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning),
    deepEqual
  );
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
