import { createContext, useContext } from "react";

export type StmCoverageCellSelection = {
  stmUuid: string;
  columnKey: string;
  /** set when a per-station sub-cell was clicked */
  stationUuid?: string;
  /** set when the "Traverses" sub-cell was clicked */
  traversesOnly?: boolean;
} | null;

/**
 * Computed coverage data shared by the EVA Coverage grid components.
 * Assembled once in stm-coverage-page.tsx and read by the header, table,
 * cells and drilldown so we don't recompute or prop-drill per row.
 */
export type StmCoverageContextValue = {
  mission: Mission;
  /**
   * Columns to render, in getEvaColumns order: manually hidden columns are
   * removed, and when "differences only" is on so are columns identical to
   * the baseline.
   */
  visibleColumns: StmCoverageEvaColumn[];
  coverageByColumnKey: { [columnKey: string]: { [stmUuid: string]: StmCoverageLevel3 } };
  baselineKey: string | null;
  diffMode: boolean;
  expandedColumnKeys: string[];
  /** Sequence-ordered stations per expanded column, keyed by column key. */
  stationsByColumnKey: { [columnKey: string]: Station[] };
  /** Level3 uuids to show when "differences only" is on; null = show all. */
  visibleStmUuids: Set<string> | null;
  cellSelection: StmCoverageCellSelection;
  setCellSelection: (selection: StmCoverageCellSelection) => void;
};

export const StmCoverageContext = createContext<StmCoverageContextValue | null>(null);

export const useStmCoverage = (): StmCoverageContextValue => {
  const context = useContext(StmCoverageContext);
  if (!context) throw new Error("useStmCoverage must be used inside StmCoverageContext");
  return context;
};
