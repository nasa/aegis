import { createContext, useContext } from "react";

export const StmCoverageContext = createContext<StmCoverageContextValue | null>(null);

export const useStmCoverage = (): StmCoverageContextValue => {
  const context = useContext(StmCoverageContext);
  if (!context) throw new Error("useStmCoverage must be used inside StmCoverageContext");
  return context;
};
