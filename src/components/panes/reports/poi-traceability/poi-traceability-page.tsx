import type { FunctionComponent } from "react";
import { useMemo } from "react";
import styles from "./poi-traceability.module.css";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { poiTraceSetFilterText, poiTraceSetScope, poiTraceSetSortKey } from "store/report";
import { useMissionDocSelector } from "utils/useDocSelector";
import { computePoiTraceability } from "utils/poiTraceability";
import { Dropdown } from "components/interface/form/globalFields";
import sortBy from "lodash/sortBy";
import PoiTraceabilityTable from "./poi-traceability-table";
import PoiTraceabilityDrilldown from "./poi-traceability-drilldown";

/** Encode/decode the scope selection to a dropdown string value. */
const scopeToValue = (scope: PoiTraceScope): string =>
  scope.type === "all" ? "all" : `${scope.type}:${scope.campaignUuid}`;
const valueToScope = (value: string): PoiTraceScope => {
  if (value === "all") return { type: "all" };
  const [type, campaignUuid] = value.split(":");
  return type === "campaignExecuted"
    ? { type: "campaignExecuted", campaignUuid }
    : { type: "campaignPlanned", campaignUuid };
};

/**
 * "POI Traceability" report: one row per POI, columns rolling up station links,
 * action promotion and execution status against a scope (All EVAs, or a
 * campaign's planned/executed set — resolved the same way as the campaign
 * columns of the other two reports). Clicking a row opens the full per-action
 * lineage in the shared drilldown side panel.
 */
const PoiTraceabilityPage: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const mission = useMissionDocSelector((m) => m, refEqual);
  const revision = useMissionDocSelector(
    (m) => ({
      pois: m?.pois,
      stations: m?.stations,
      evas: m?.evas,
      rexes: m?.rexes,
      actions: m?.actions,
      reportCampaigns: m?.reportCampaigns,
    }),
    shallowEqual
  );
  const scope = useAppSelector((state) => state.report.poiTrace.scope, refEqual);
  const filterText = useAppSelector((state) => state.report.poiTrace.filterText, refEqual);
  const sortKey = useAppSelector((state) => state.report.poiTrace.sortKey, refEqual);
  const selectedPoiUuid = useAppSelector(
    (state) => state.report.poiTrace.selectedPoiUuid,
    refEqual
  );

  const campaigns = useMemo(
    () => sortBy(Object.values(mission?.reportCampaigns ?? {}), [(c) => c.name.toLowerCase()]),
    [mission?.reportCampaigns]
  );

  const rows = useMemo(
    () => (mission ? computePoiTraceability({ mission, scope }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on revision + scope
    [revision, scope]
  );

  const filteredRows = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    const matched = needle
      ? rows.filter(
          (row) =>
            row.name.toLowerCase().includes(needle) ||
            row.tags.some((tag) => tag.toLowerCase().includes(needle))
        )
      : rows;
    return sortKey === "name"
      ? sortBy(matched, [(row) => row.name.toLowerCase()])
      : sortBy(matched, [
          (row) => (row.priorityOverride == null ? Number.POSITIVE_INFINITY : row.priorityOverride),
          (row) => row.name.toLowerCase(),
        ]);
  }, [rows, filterText, sortKey]);

  const selectedRow = filteredRows.find((row) => row.poiUuid === selectedPoiUuid) ?? null;

  if (!mission) return null;

  return (
    <div className={styles.body}>
      <div className={styles.main}>
        <div className={styles.controls}>
          <div className={styles.controlGroup}>
            <div className={styles.controlLabel}>Scope</div>
            <Dropdown
              selected={scopeToValue(scope)}
              onChange={(value) => dispatch(poiTraceSetScope(valueToScope(value)))}
              containerStyle={{ width: "240px", flex: "0 0 240px" }}
              toolTip="Which EVAs the traceability rollup is computed over"
            >
              <option value="all">All EVAs</option>
              {campaigns.map((campaign) => (
                <optgroup key={campaign.uuid} label={campaign.name}>
                  <option value={`campaignPlanned:${campaign.uuid}`}>
                    {campaign.name} — Planned set
                  </option>
                  <option value={`campaignExecuted:${campaign.uuid}`}>
                    {campaign.name} — Executed set
                  </option>
                </optgroup>
              ))}
            </Dropdown>
          </div>
          <div className={styles.controlGroup}>
            <div className={styles.controlLabel}>Filter</div>
            <input
              className={styles.filterInput}
              value={filterText}
              placeholder="name or tag…"
              aria-label="Filter POIs by name or tag"
              onChange={(event) => dispatch(poiTraceSetFilterText(event.target.value))}
            />
          </div>
          <div className={styles.controlGroup}>
            <div className={styles.controlLabel}>Sort</div>
            <Dropdown
              selected={sortKey}
              onChange={(value) => dispatch(poiTraceSetSortKey(value as PoiTraceSortKey))}
              toolTip="Row sort order"
            >
              <option value="priority">Priority</option>
              <option value="name">Name</option>
            </Dropdown>
          </div>
        </div>
        <PoiTraceabilityTable rows={filteredRows} selectedPoiUuid={selectedPoiUuid} />
      </div>
      {selectedRow && <PoiTraceabilityDrilldown row={selectedRow} />}
    </div>
  );
};

export default PoiTraceabilityPage;
