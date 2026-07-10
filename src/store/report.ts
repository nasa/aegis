import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "store/crossActions";

/**
 * UI + derived state for the Reports pane, keyed by report id. The two
 * column-family reports (EVA STM Coverage, EVA Comparison) share the
 * ColumnReportState shape and a single set of reducers that take a `reportId`;
 * the POI Traceability report keeps its own `poiTrace` slot with its own
 * reducers. Shared grid components read `state.report[reportId].*`.
 */

const initialColumnReportState = (): ColumnReportState => ({
  baselineColumnKey: null,
  diffMode: true,
  differencesOnly: false,
  rexStatusFilter: "all",
  hiddenColumns: [],
  expandedColumns: [],
  hoveredTopItem: null,
  hoveredLeftItem: null,
  drilldownWidth: 320,
  drilldownChangesOnly: false,
  cellSelection: null,
  visibleColumns: [],
  resolvedBaselineKey: null,
  sequenceByColumnKey: {},
  visibleRowIds: null,
  coverageByColumnKey: {},
  metricsByColumnKey: {},
});

export const initialState: ReportState = {
  stmCoverage: initialColumnReportState(),
  comparison: initialColumnReportState(),
  poiTrace: {
    scope: { type: "all" },
    filterText: "",
    sortKey: "priority",
    selectedPoiUuid: null,
    drilldownWidth: 360,
  },
};

export const reportSlice = createSlice({
  name: "report",
  initialState,
  reducers: {
    reportSetBaselineColumnKey: (
      state,
      action: { payload: { reportId: ColumnReportId; columnKey: string | null } }
    ) => {
      state[action.payload.reportId].baselineColumnKey = action.payload.columnKey;
    },
    reportToggleDiffMode: (state, action: { payload: { reportId: ColumnReportId } }) => {
      const report = state[action.payload.reportId];
      report.diffMode = !report.diffMode;
    },
    reportToggleDifferencesOnly: (state, action: { payload: { reportId: ColumnReportId } }) => {
      const report = state[action.payload.reportId];
      report.differencesOnly = !report.differencesOnly;
    },
    reportSetRexStatusFilter: (
      state,
      action: { payload: { reportId: ColumnReportId; value: RexStatusFilter } }
    ) => {
      state[action.payload.reportId].rexStatusFilter = action.payload.value;
    },
    reportToggleHiddenColumn: (
      state,
      action: { payload: { reportId: ColumnReportId; columnKey: string } }
    ) => {
      const report = state[action.payload.reportId];
      const index = report.hiddenColumns.indexOf(action.payload.columnKey);
      if (index > -1) report.hiddenColumns.splice(index, 1);
      else report.hiddenColumns.push(action.payload.columnKey);
    },
    // Hide/show several columns atomically (used when toggling an as-planned EVA
    // in the Columns panel, which also hides/shows its REX children).
    reportSetColumnsHidden: (
      state,
      action: { payload: { reportId: ColumnReportId; columnKeys: string[]; hidden: boolean } }
    ) => {
      const report = state[action.payload.reportId];
      const { columnKeys, hidden } = action.payload;
      report.hiddenColumns = hidden
        ? [...new Set([...report.hiddenColumns, ...columnKeys])]
        : report.hiddenColumns.filter((key) => !columnKeys.includes(key));
    },
    reportToggleColumnExpansion: (
      state,
      action: { payload: { reportId: ColumnReportId; columnKey: string } }
    ) => {
      const report = state[action.payload.reportId];
      const index = report.expandedColumns.indexOf(action.payload.columnKey);
      if (index > -1) report.expandedColumns.splice(index, 1);
      else report.expandedColumns.push(action.payload.columnKey);
    },
    reportSetHoveredTopItem: (
      state,
      action: { payload: { reportId: ColumnReportId; item: string | null } }
    ) => {
      state[action.payload.reportId].hoveredTopItem = action.payload.item;
    },
    reportSetHoveredLeftItem: (
      state,
      action: { payload: { reportId: ColumnReportId; item: string | null } }
    ) => {
      state[action.payload.reportId].hoveredLeftItem = action.payload.item;
    },
    reportSetDrilldownWidth: (
      state,
      action: { payload: { reportId: ColumnReportId; width: number } }
    ) => {
      state[action.payload.reportId].drilldownWidth = action.payload.width;
    },
    reportToggleDrilldownChangesOnly: (
      state,
      action: { payload: { reportId: ColumnReportId } }
    ) => {
      const report = state[action.payload.reportId];
      report.drilldownChangesOnly = !report.drilldownChangesOnly;
    },
    reportSetCellSelection: (
      state,
      action: { payload: { reportId: ColumnReportId; selection: StmCoverageCellSelection } }
    ) => {
      state[action.payload.reportId].cellSelection = action.payload.selection;
    },
    reportSetColumnDerivedData: (
      state,
      action: { payload: { reportId: ColumnReportId; data: ColumnReportDerivedData } }
    ) => {
      const report = state[action.payload.reportId];
      const { data } = action.payload;
      report.visibleColumns = data.visibleColumns;
      report.resolvedBaselineKey = data.resolvedBaselineKey;
      report.sequenceByColumnKey = data.sequenceByColumnKey;
      report.visibleRowIds = data.visibleRowIds;
      if (data.coverageByColumnKey) report.coverageByColumnKey = data.coverageByColumnKey;
      if (data.metricsByColumnKey) report.metricsByColumnKey = data.metricsByColumnKey;
    },
    // ---- POI Traceability ----
    poiTraceSetScope: (state, action: { payload: PoiTraceScope }) => {
      state.poiTrace.scope = action.payload;
    },
    poiTraceSetFilterText: (state, action: { payload: string }) => {
      state.poiTrace.filterText = action.payload;
    },
    poiTraceSetSortKey: (state, action: { payload: PoiTraceSortKey }) => {
      state.poiTrace.sortKey = action.payload;
    },
    poiTraceSetSelectedPoi: (state, action: { payload: string | null }) => {
      state.poiTrace.selectedPoiUuid = action.payload;
    },
    poiTraceSetDrilldownWidth: (state, action: { payload: number }) => {
      state.poiTrace.drilldownWidth = action.payload;
    },
    obliterateState: (state) => {
      Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      if (action.payload.report) Object.assign(state, action.payload.report);
    });
  },
});

export const {
  reportSetBaselineColumnKey,
  reportToggleDiffMode,
  reportToggleDifferencesOnly,
  reportSetRexStatusFilter,
  reportToggleHiddenColumn,
  reportSetColumnsHidden,
  reportToggleColumnExpansion,
  reportSetHoveredTopItem,
  reportSetHoveredLeftItem,
  reportSetDrilldownWidth,
  reportToggleDrilldownChangesOnly,
  reportSetCellSelection,
  reportSetColumnDerivedData,
  poiTraceSetScope,
  poiTraceSetFilterText,
  poiTraceSetSortKey,
  poiTraceSetSelectedPoi,
  poiTraceSetDrilldownWidth,
  obliterateState,
} = reportSlice.actions;
