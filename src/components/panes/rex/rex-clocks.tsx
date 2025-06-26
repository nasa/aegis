import { FunctionComponent, useState } from "react";

import rexStyles from "./rex.module.css";
import PetInterval from "components/page/petInterval";

const RexClocks: FunctionComponent<{ selectedRex: Rex }> = ({ selectedRex }) => {
  return (
    <>
      <div className={rexStyles.panelContainer}>
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
    <div className={rexStyles.clockRow}>
      <PetInterval runningRex={selectedRex} rexPetTime={rexPetTime} setRexPetTime={setRexPetTime} />
      <div className={rexStyles.clockRowHeader}>
        <div className={rexStyles.clockName}>EVA PET</div>
        <div className={rexStyles.clockValue} style={{ color: "var(--rex)" }}>
          {rexPetTime}
        </div>
      </div>
    </div>
  );
};
