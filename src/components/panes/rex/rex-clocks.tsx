import { FunctionComponent, useState } from "react";

import styles from "./rex.module.css";
import PetInterval from "components/page/petInterval";

const RexClocks: FunctionComponent<{ selectedRex: Rex }> = ({ selectedRex }) => {
  return (
    <>
      <div className={styles.panelContainer}>
        <PetClock selectedRex={selectedRex} />
      </div>
    </>
  );
};

export default RexClocks;

const PetClock: FunctionComponent<{ selectedRex: Rex }> = ({ selectedRex }) => {
  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");

  return (
    <div className={styles.clockRow}>
      <PetInterval runningRex={selectedRex} rexPetTime={rexPetTime} setRexPetTime={setRexPetTime} />
      <div className={styles.clockRowHeader}>
        <div className={styles.clockName}>EVA PET</div>
        <div className={styles.clockValue} style={{ color: "var(--rex)" }}>
          {rexPetTime}
        </div>
      </div>
    </div>
  );
};
