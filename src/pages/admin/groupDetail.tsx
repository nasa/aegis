import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { getAppUsers } from "http-client/access/appUsers";
import {
  deleteMissionPermission,
  getGroupMissionGrants,
  upsertMissionPermission,
} from "http-client/access/missionPermission";
import { getUserGroups, upsertUserGroup } from "http-client/access/userGroup";
import { getGroupMembers, setGroupMembership } from "http-client/access/userGroupMember";
import { getMissionHomepageItems } from "http-client/mission";
import { PERMISSION_LEVELS, permissionLevelLabel, PUBLIC_UUPIC } from "utils/permissionsClient";
import adminCommon from "./adminCommon.module.css";

/** One group: its details, its members, and the missions it grants. */
const GroupDetail: React.FunctionComponent = () => {
  const params = useParams<{ id: string }>();
  const groupId = parseInt(params.id, 10);

  const [group, setGroup] = useState<UserGroupSummary | null>(null);
  const [members, setMembers] = useState<AppUser[]>([]);
  // Null until a search has been submitted, so "no results" reads differently from "not searched".
  const [candidates, setCandidates] = useState<AppUserSummary[] | null>(null);
  const [search, setSearch] = useState("");
  const [missions, setMissions] = useState<MissionHomepageItem[]>([]);
  const [grants, setGrants] = useState<MissionPermission[]>([]);
  const [showAllMissions, setShowAllMissions] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [grantNotesDraft, setGrantNotesDraft] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!groupId) return;

    const [groupsRes, membersRes, missionsRes, grantsRes] = await Promise.all([
      getUserGroups(),
      getGroupMembers(groupId),
      getMissionHomepageItems(true),
      getGroupMissionGrants(groupId),
    ]);

    const found = (groupsRes.data ?? []).find((g) => g.id === groupId) ?? null;
    setGroup(found);
    setName(found?.name ?? "");
    setDescription(found?.description ?? "");
    setMembers(membersRes.data ?? []);
    setMissions(missionsRes.data ?? []);
    setGrants(grantsRes.data ?? []);
    setGrantNotesDraft(new Map((grantsRes.data ?? []).map((g) => [g.missionId, g.notes ?? ""])));
  }, [groupId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSearch = async () => {
    const response = await getAppUsers({ search: search.trim() });
    setCandidates(response.data ?? []);
  };

  const apply = async (response: WrappedResponse<unknown>, failureMessage: string) => {
    if (response.status !== "success") {
      alert(`${failureMessage} Please let the AEGIS developers know. Status ${response.message}`);
      setError(response.message ?? failureMessage);
      return;
    }
    setError(null);
    await loadAll();
  };

  const handleSaveDetails = async () => {
    await apply(
      await upsertUserGroup({
        groupId,
        name: name.trim() || undefined,
        description: description.trim() || null,
      }),
      "Error saving the group."
    );
  };

  const handleMembership = async (userId: number, action: "add" | "remove") => {
    await apply(
      await setGroupMembership({ groupId, userId, action }),
      "Error updating group membership."
    );
    // Drop the result list so an added user cannot be added twice from a now-stale row.
    if (action === "add") setCandidates(null);
  };

  const grantFor = (missionId: number): MissionPermission | undefined =>
    grants.find((g) => g.missionId === missionId);

  const handleGrant = async (missionId: number, permLevel: string) => {
    await apply(
      permLevel
        ? await upsertMissionPermission({
            missionId,
            groupId,
            permLevel: permLevel as PermissionLevel,
            notes: grantNotesDraft.get(missionId) || null,
          })
        : await deleteMissionPermission({ missionId, groupId }),
      "Error changing the grant."
    );
  };

  const handleGrantNotesSave = async (missionId: number) => {
    const grant = grantFor(missionId);
    if (!grant) return;
    await apply(
      await upsertMissionPermission({
        missionId,
        groupId,
        permLevel: grant.permLevel,
        notes: grantNotesDraft.get(missionId) || null,
      }),
      "Error saving the note."
    );
  };

  if (!group) return null;

  const memberIds = new Set(members.map((m) => m.id));
  // Public is a shared principal, not a person; membership would make the baseline union recursive.
  const searchResults = (candidates ?? [])
    .filter((c) => !memberIds.has(c.id) && c.uupic !== PUBLIC_UUPIC)
    .slice(0, 20);
  const visibleMissions = showAllMissions ? missions : missions.filter((m) => !!grantFor(m.id));

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/group" className={adminCommon.backLink}>
          ← Groups
        </Link>
        <h1 className={adminCommon.pageTitle}>{group.name}</h1>
        <p className={adminCommon.introText}>
          Members inherit every mission this group grants, on top of anything granted to them
          directly.
        </p>

        {error && <div className={adminCommon.statusMessage}>{error}</div>}

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Group Details</h2>
          <div className={adminCommon.details}>
            <div className={adminCommon.form}>
              <div className={adminCommon.formGroup}>
                <label className={adminCommon.formLabel} htmlFor="groupName">
                  Name
                </label>
                <input
                  id="groupName"
                  className={adminCommon.formInput}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className={adminCommon.formGroup}>
                <label className={adminCommon.formLabel} htmlFor="groupDescription">
                  Description
                </label>
                <span className={adminCommon.formHint}>
                  Why this group exists. Documentation only; never used in a permission decision.
                </span>
                <input
                  id="groupDescription"
                  className={adminCommon.formInput}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className={adminCommon.formActions}>
                <button
                  type="button"
                  className={adminCommon.buttonPrimary}
                  onClick={handleSaveDetails}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Members</h2>
          <div className={adminCommon.details}>
            <table className={adminCommon.table}>
              <thead>
                <tr>
                  <th>Display Name</th>
                  <th>AUID</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <Link to={`/admin/user/${member.id}`}>{member.displayName}</Link>
                    </td>
                    <td>{member.auid}</td>
                    <td>
                      <button
                        type="button"
                        className={adminCommon.buttonDanger}
                        onClick={() => handleMembership(member.id, "remove")}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={3} className={adminCommon.emptyState}>
                      No members
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className={adminCommon.formGroup}>
              <label className={adminCommon.formLabel} htmlFor="memberSearch">
                Add a member
              </label>
              <div className={adminCommon.inlineFormRow}>
                <input
                  id="memberSearch"
                  className={adminCommon.formInput}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSearch();
                  }}
                  placeholder="Search by AUID or name"
                  style={{ maxWidth: 400 }}
                />
                <button type="button" className={adminCommon.buttonPrimary} onClick={handleSearch}>
                  Search
                </button>
              </div>
            </div>

            {candidates !== null && (
              <table className={adminCommon.tableCompact}>
                <tbody>
                  {searchResults.map((candidate) => (
                    <tr key={candidate.id}>
                      <td>{candidate.displayName}</td>
                      <td>{candidate.auid}</td>
                      <td>
                        <button
                          type="button"
                          className={adminCommon.button}
                          onClick={() => handleMembership(candidate.id, "add")}
                        >
                          Add To Group
                        </button>
                      </td>
                    </tr>
                  ))}
                  {searchResults.length === 0 && (
                    <tr>
                      <td colSpan={3} className={adminCommon.emptyState}>
                        No users match who are not already members.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Missions</h2>
          <div className={adminCommon.details}>
            <label className={adminCommon.checkboxItem}>
              <input
                type="checkbox"
                checked={showAllMissions}
                onChange={(event) => setShowAllMissions(event.target.checked)}
              />
              Show missions this group does not grant
            </label>
            <br />
            <table className={`${adminCommon.table} ${adminCommon.missionGrantTable}`}>
              <thead>
                <tr>
                  <th>Mission</th>
                  <th>Permission Level</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {visibleMissions.map((mission) => {
                  const grant = grantFor(mission.id);
                  return (
                    <tr key={mission.id}>
                      <td>{mission.name}</td>
                      <td>
                        <select
                          className={adminCommon.formInput}
                          value={grant?.permLevel ?? ""}
                          onChange={(event) => handleGrant(mission.id, event.target.value)}
                        >
                          <option value="">None</option>
                          {PERMISSION_LEVELS.map((permLevel) => (
                            <option key={permLevel} value={permLevel}>
                              {permissionLevelLabel(permLevel)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <textarea
                          className={adminCommon.formTextarea}
                          rows={2}
                          disabled={!grant}
                          value={grantNotesDraft.get(mission.id) ?? ""}
                          placeholder="Why this grant exists"
                          onChange={(event) =>
                            setGrantNotesDraft((prev) =>
                              new Map(prev).set(mission.id, event.target.value)
                            )
                          }
                          onBlur={() => handleGrantNotesSave(mission.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
                {visibleMissions.length === 0 && (
                  <tr>
                    <td colSpan={3} className={adminCommon.emptyState}>
                      This group grants no missions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
};

export default GroupDetail;
