import { createContext, useContext } from "react";

/**
 * Identifies which report a shared grid component belongs to, so it reads and
 * writes the right slot of the `report` Redux slice (state.report[reportId]).
 * Each column-report page wraps its subtree in a provider; shared components
 * call useReportId() instead of prop-drilling the id down through every cell.
 */
const ReportIdContext = createContext<ColumnReportId>("stmCoverage");

export const ReportIdProvider = ReportIdContext.Provider;

export const useReportId = (): ColumnReportId => useContext(ReportIdContext);
