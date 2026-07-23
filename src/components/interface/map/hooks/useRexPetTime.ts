/**
 * useRexPetTime — shared hook that ticks a PET (Phase Elapsed Time) value
 * for the currently running REX.
 *
 * Returns the current PET time as an "hh:mm:ss" string (or "" if no REX
 * is running). Updates every 100 ms while the REX PET clock is active.
 *
 * This hook intentionally keeps PET time as LOCAL state to avoid full-tree
 * rerenders on every tick. Each consumer (e.g. POS overlay) gets its own
 * subscription and re-renders independently.
 */

import { useEffect, useRef, useState } from "react";
import { deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { calculatePetValue } from "utils/formatting";

interface RunningRexPetInfo {
  petStartStopTimestamp: string | null;
  petValueAtStartStop: string;
  petRunning: boolean;
}

/**
 * Returns the current PET time string ("+hh:mm:ss") for the running REX,
 * or "" if no REX is running or PET is paused.
 */
export function useRexPetTime(): string {
  const [petTime, setPetTime] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runningRexPetInfo = useMissionDocSelector((m): RunningRexPetInfo | null => {
    const running = Object.values(m.rexes ?? {}).find((r) => r.isRunning);
    if (!running) return null;
    return {
      petStartStopTimestamp: running.petStartStopTimestamp,
      petValueAtStartStop: running.petValueAtStartStop,
      petRunning: running.petRunning,
    };
  }, deepEqual);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!runningRexPetInfo) {
      setPetTime("");
      return;
    }

    if (runningRexPetInfo.petRunning) {
      // Tick every 100ms while running
      intervalRef.current = setInterval(() => {
        const newPetTime = calculatePetValue({
          petStartStopTimestamp: runningRexPetInfo.petStartStopTimestamp,
          petValueAtStartStop: runningRexPetInfo.petValueAtStartStop,
        });
        setPetTime((prev) => (prev !== newPetTime ? newPetTime : prev));
      }, 100);
    } else {
      // PET paused — show static value
      setPetTime(runningRexPetInfo.petValueAtStartStop);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runningRexPetInfo]);

  return petTime;
}
