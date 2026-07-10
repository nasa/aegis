import { faFlag, faPlus, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FunctionComponent } from "react";
import { useEffect, useRef, useState } from "react";

import {
  applyCreateReportCampaign,
  applyDeleteReportCampaign,
  applyUpdateReportCampaignByField,
} from "client/automerge/apply/apply-mission-reportCampaign";
import { withMissionChange } from "client/automergeDocHandles";
import { Button, Dropdown } from "components/interface/form/globalFields";
import {
  getAsPlannedEvas,
  getExecutionRexesForEva,
  resolveCampaignExecutionRexes,
} from "utils/evaReportColumns";
import { useMissionDocSelector } from "utils/useDocSelector";
import { deepEqual } from "utils/useAppSelector";

import styles from "./report-campaigns-dialog.module.css";

const ReportCampaignsDialog: FunctionComponent = () => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mission = useMissionDocSelector((doc) => doc, deepEqual);
  const [selectedCampaignUuid, setSelectedCampaignUuid] = useState<string | null>(null);

  const campaigns = Object.values(mission?.reportCampaigns ?? {}).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  const selectedCampaign = selectedCampaignUuid
    ? mission?.reportCampaigns?.[selectedCampaignUuid]
    : undefined;

  useEffect(() => {
    if (selectedCampaignUuid && !selectedCampaign) setSelectedCampaignUuid(null);
  }, [selectedCampaign, selectedCampaignUuid]);

  const updateCampaign = <K extends keyof ReportCampaign>(
    fieldName: K,
    value: ReportCampaign[K]
  ) => {
    if (!selectedCampaign) return;
    withMissionChange((m) =>
      applyUpdateReportCampaignByField(m, {
        reportCampaignUuid: selectedCampaign.uuid,
        fieldName,
        value,
      })
    );
  };

  const toggleMember = (evaUuid: string) => {
    if (!selectedCampaign) return;
    const isMember = selectedCampaign.memberEvaUuids.includes(evaUuid);
    const memberEvaUuids = isMember
      ? selectedCampaign.memberEvaUuids.filter((uuid) => uuid !== evaUuid)
      : [...selectedCampaign.memberEvaUuids, evaUuid];
    const executionSelections = { ...(selectedCampaign.executionRexUuidByEvaUuid ?? {}) };
    if (isMember) delete executionSelections[evaUuid];

    withMissionChange((m) => {
      applyUpdateReportCampaignByField(m, {
        reportCampaignUuid: selectedCampaign.uuid,
        fieldName: "memberEvaUuids",
        value: memberEvaUuids,
      });
      if (isMember) {
        applyUpdateReportCampaignByField(m, {
          reportCampaignUuid: selectedCampaign.uuid,
          fieldName: "executionRexUuidByEvaUuid",
          value: Object.keys(executionSelections).length ? executionSelections : null,
        });
      }
    });
  };

  const selectExecutionRex = (evaUuid: string, rexUuid: string) => {
    if (!selectedCampaign) return;
    const executionSelections = { ...(selectedCampaign.executionRexUuidByEvaUuid ?? {}) };
    if (rexUuid) executionSelections[evaUuid] = rexUuid;
    else delete executionSelections[evaUuid];
    updateCampaign(
      "executionRexUuidByEvaUuid",
      Object.keys(executionSelections).length ? executionSelections : null
    );
  };

  const asPlannedEvas = mission ? getAsPlannedEvas(mission) : [];
  const existingMemberCount = selectedCampaign
    ? selectedCampaign.memberEvaUuids.filter((uuid) => mission?.evas?.[uuid]).length
    : 0;
  const executedCount =
    mission && selectedCampaign
      ? resolveCampaignExecutionRexes(mission, selectedCampaign).length
      : 0;

  return (
    <>
      <Button
        icon={faFlag}
        label="Campaigns…"
        onClick={() => dialogRef.current?.showModal()}
        toolTip="Manage reporting campaigns"
        style={{ fontSize: "0.85em", width: "110px" }}
      />
      <dialog ref={dialogRef} className={styles.dialog} onClick={() => dialogRef.current?.close()}>
        <div className={styles.dialogInner} onClick={(event) => event.stopPropagation()}>
          <div className={styles.header}>
            <div className={styles.title}>Campaigns</div>
            <div
              className={styles.close}
              onClick={() => dialogRef.current?.close()}
              aria-label="Close campaigns"
              role="button"
            >
              <FontAwesomeIcon icon={faXmark} />
            </div>
          </div>
          <div className={styles.body}>
            <aside className={styles.campaignList}>
              <Button
                icon={faPlus}
                label="New campaign"
                onClick={() => {
                  const uuid = withMissionChange((m) => applyCreateReportCampaign(m));
                  setSelectedCampaignUuid(uuid);
                }}
                style={{ justifyContent: "flex-start", gap: "4px", marginBottom: "8px" }}
              />
              {campaigns.map((campaign) => (
                <button
                  type="button"
                  key={campaign.uuid}
                  className={`${styles.campaignListItem} ${
                    campaign.uuid === selectedCampaignUuid ? styles.campaignListItemSelected : ""
                  }`}
                  onClick={() => setSelectedCampaignUuid(campaign.uuid)}
                >
                  {campaign.name}
                </button>
              ))}
              {campaigns.length === 0 && <div className={styles.empty}>No campaigns yet.</div>}
            </aside>

            <main className={styles.editor}>
              {!selectedCampaign && (
                <div className={styles.empty}>Select a campaign or create a new one.</div>
              )}
              {selectedCampaign && mission && (
                <>
                  <div className={styles.editorHeader}>
                    <input
                      className={styles.nameInput}
                      aria-label="Campaign name"
                      value={selectedCampaign.name}
                      maxLength={255}
                      onChange={(event) => updateCampaign("name", event.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.deleteButton}
                      aria-label="Delete Campaign"
                      title="Delete campaign"
                      onClick={() => {
                        if (!window.confirm(`Delete campaign “${selectedCampaign.name}”?`)) return;
                        withMissionChange((m) =>
                          applyDeleteReportCampaign(m, {
                            reportCampaignUuid: selectedCampaign.uuid,
                          })
                        );
                        setSelectedCampaignUuid(null);
                      }}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                  <label className={styles.fieldLabel} htmlFor="report-campaign-description">
                    Description
                  </label>
                  <textarea
                    id="report-campaign-description"
                    className={styles.description}
                    value={selectedCampaign.description ?? ""}
                    maxLength={2000}
                    onChange={(event) => updateCampaign("description", event.target.value || null)}
                  />
                  <div className={styles.membersHeader}>
                    <span>As-planned EVAs</span>
                    <span>
                      {executedCount} of {existingMemberCount} executed
                    </span>
                  </div>
                  <div className={styles.memberList}>
                    {asPlannedEvas.map((eva) => {
                      const isMember = selectedCampaign.memberEvaUuids.includes(eva.uuid);
                      const rexes = getExecutionRexesForEva(mission, eva.uuid);
                      return (
                        <div className={styles.memberRow} key={eva.uuid}>
                          <label className={styles.memberCheckbox}>
                            <input
                              type="checkbox"
                              checked={isMember}
                              onChange={() => toggleMember(eva.uuid)}
                            />
                            <span>{eva.name}</span>
                          </label>
                          {isMember && (
                            <Dropdown
                              selected={
                                selectedCampaign.executionRexUuidByEvaUuid?.[eva.uuid] ?? ""
                              }
                              onChange={(value) => selectExecutionRex(eva.uuid, value)}
                              toolTip="Execution REX used by this campaign"
                            >
                              <option value="">Latest</option>
                              {rexes.map((rex) => (
                                <option key={rex.uuid} value={rex.uuid}>
                                  {rex.name}
                                </option>
                              ))}
                            </Dropdown>
                          )}
                        </div>
                      );
                    })}
                    {asPlannedEvas.length === 0 && (
                      <div className={styles.empty}>No as-planned EVAs are available.</div>
                    )}
                  </div>
                </>
              )}
            </main>
          </div>
        </div>
      </dialog>
    </>
  );
};

export default ReportCampaignsDialog;
