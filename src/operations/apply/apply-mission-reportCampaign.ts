import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

import { applyUpdateMissionByField } from "./apply-mission";

/** Insert a new blank reporting campaign into the Mission draft. */
export function applyCreateReportCampaign(m: Mission): string {
  const reportCampaignUuid = uuidv4();
  const blankReportCampaign: ReportCampaign = {
    uuid: reportCampaignUuid,
    name: "(Campaign Name)",
    description: null,
    memberEvaUuids: [],
    executionRexUuidByEvaUuid: null,
    createdAt: getAccurateNow().getTime(),
    updatedAt: null,
  };
  applyUpdateMissionByField(m, {
    fieldName: "reportCampaigns",
    mapKey: reportCampaignUuid,
    mapValue: blankReportCampaign,
  });
  return reportCampaignUuid;
}

/** Delete a reporting campaign from the Mission draft. */
export function applyDeleteReportCampaign(
  m: Mission,
  { reportCampaignUuid }: { reportCampaignUuid: string }
): void {
  if (m.reportCampaigns?.[reportCampaignUuid]) {
    delete m.reportCampaigns[reportCampaignUuid];
    m.updatedAt = getAccurateNow().getTime();
  }
}

/** Update one field on a reporting campaign in the Mission draft. */
export function applyUpdateReportCampaignByField<K extends keyof ReportCampaign>(
  m: Mission,
  {
    reportCampaignUuid,
    fieldName,
    value,
  }: {
    reportCampaignUuid: string;
    fieldName: K;
    value: ReportCampaign[K];
  }
): void {
  const reportCampaign = m.reportCampaigns?.[reportCampaignUuid];
  if (reportCampaign) {
    reportCampaign[fieldName] = cloneDeep(value);
    const now = getAccurateNow().getTime();
    reportCampaign.updatedAt = now;
    m.updatedAt = now;
  }
}
