import { createContext, useContext } from "react";

interface MissionDockviewContextValue {
  openMapMenu: () => void;
  closeMapMenu: () => void;
}

export const MissionDockviewContext = createContext<MissionDockviewContextValue | null>(null);

export function useMissionDockview(): MissionDockviewContextValue {
  const context = useContext(MissionDockviewContext);
  if (!context) {
    throw new Error("useMissionDockview must be used inside <MissionDockviewLayout>");
  }
  return context;
}
