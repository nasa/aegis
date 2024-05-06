import { FunctionComponent, useEffect, useRef } from "react";

import _ from "lodash";
import { calculatePetValue } from "utils/formatting";

/**
 * Runs a setInterval to update the parent component's PET value based on the currently executing rex
 * @param runningRex - the currently running rex that contains the PET clock variables
 * @param rexPetTime - the current PET value useState variable from the parent component
 * @param setRexPetTime - the setter for the rexPetTime useState variable from the parent component
 * @returns Nothin'
 */
const PetInterval: FunctionComponent<{
  runningRex: Rex;
  rexPetTime: string;
  setRexPetTime: Function;
}> = ({ runningRex, rexPetTime, setRexPetTime }) => {
  const petIntervalRef = useRef(null);

  useEffect(() => {
    if (!runningRex) return;

    if (runningRex.petRunning) {
      if (!petIntervalRef.current) {
        petIntervalRef.current = setInterval(() => {
          const newPetTime = calculatePetValue({
            petStartStopTimestamp: runningRex.petStartStopTimestamp,
            petValueAtStartStop: runningRex.petValueAtStartStop,
          });
          if (rexPetTime !== newPetTime) setRexPetTime(newPetTime);
        }, 100);
      }
    } else {
      clearInterval(petIntervalRef.current);
      petIntervalRef.current = null;
      setRexPetTime(runningRex.petValueAtStartStop);
      return;
    }

    return () => {
      clearInterval(petIntervalRef.current);
      petIntervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petIntervalRef, runningRex]);

  return <></>;
};

export default PetInterval;
