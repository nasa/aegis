import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { getAppUsers } from "http-client/access/appUsers";
import {
  getUserAccessForAllMissions,
  upsertMissionPermission,
  deleteMissionPermission,
} from "http-client/access/missionPermission";
import { getUserGroups } from "http-client/access/userGroup";
import { getGroupsForUser, setGroupMembership } from "http-client/access/userGroupMember";
import { getMissionHomepageItems } from "http-client/mission";
import { PERMISSION_LEVELS, permissionLevelLabel, PUBLIC_UUPIC } from "utils/permissionsClient";
import adminCommon from "./adminCommon.module.css";

const contributionLabel = (contribution: MissionAccessContribution): string => {
  if (contribution.source === "direct") return "Direct grant";
  if (contribution.source === "public") return "Public baseline";
  return `Group: ${contribution.groupName ?? contribution.groupId}`;
};

/**
 * One user: their group memberships and every mission they can reach.
 *
 * Every contributing grant is listed, not just the winner, so an admin can see a direct grant that
 * a group currently out-ranks. Only direct grants are editable here; group and public rows link to
 * wherever they are actually managed.
 */
const UserDetail: React.FunctionComponent = () => {
  const params = useParams<{ id: string }>();
  const userId = parseInt(params.id, 10);

  const [user, setUser] = useState<AppUserSummary | null>(null);
  const [access, setAccess] = useState<ResolvedMissionAccess[]>([]);
  const [groups, setGroups] = useState<UserGroupSummary[]>([]);
  const [memberGroupIds, setMemberGroupIds] = useState<number[]>([]);
  const [missions, setMissions] = useState<MissionHomepageItem[]>([]);
  const [showAllMissions, setShowAllMissions] = useState(false);
  const [notesDraft, setNotesDraft] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const isPublic = user?.uupic === PUBLIC_UUPIC;
  // Public is capped at viewer, which is what keeps the union safe: it can add missions to
  // everyone's access but can never hand out edit rights.
  const selectableLevels: PermissionLevel[] = isPublic ? ["viewer"] : PERMISSION_LEVELS;

  const loadAll = useCallback(async () => {
    if (!userId) return;

    const [usersRes, accessRes, groupsRes, membershipRes, missionsRes] = await Promise.all([
      getAppUsers({ userId }),
      getUserAccessForAllMissions(userId),
      getUserGroups(),
      getGroupsForUser(userId),
      getMissionHomepageItems(true),
    ]);

    setUser((usersRes.data ?? [])[0] ?? null);
    setAccess(accessRes.data ?? []);
    setGroups(groupsRes.data ?? []);
    setMemberGroupIds((membershipRes.data ?? []).map((g) => g.id));
    setMissions(missionsRes.data ?? []);

    const drafts = new Map<number, string>();
    for (const entry of accessRes.data ?? []) {
      const direct = entry.contributions.find((c) => c.source === "direct");
      if (direct) drafts.set(entry.missionId, direct.notes ?? "");
    }
    setNotesDraft(drafts);
  }, [userId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const accessFor = (missionId: number): ResolvedMissionAccess | undefined =>
    access.find((a) => a.missionId === missionId);

  const directLevelFor = (missionId: number): PermissionLevel | "" =>
    accessFor(missionId)?.contributions.find((c) => c.source === "direct")?.permLevel ?? "";

  const apply = async (response: WrappedResponse<unknown>, failureMessage: string) => {
    if (response.status !== "success") {
      alert(`${failureMessage} Please let the AEGIS developers know. Status ${response.message}`);
      setError(response.message ?? failureMessage);
      return;
    }
    setError(null);
    await loadAll();
  };

  const handlePermLevelChange = async (missionId: number, permLevel: string) => {
    await apply(
      permLevel
        ? await upsertMissionPermission({
            missionId,
            userId,
            permLevel: permLevel as PermissionLevel,
            notes: notesDraft.get(missionId) || null,
          })
        : await deleteMissionPermission({ missionId, userId }),
      "Error changing the grant."
    );
  };

  const handleNotesSave = async (missionId: number) => {
    const permLevel = directLevelFor(missionId);
    if (!permLevel) return;
    await apply(
      await upsertMissionPermission({
        missionId,
        userId,
        permLevel,
        notes: notesDraft.get(missionId) || null,
      }),
      "Error saving the note."
    );
  };

  const handleMembershipChange = async (groupId: number, add: boolean) => {
    await apply(
      await setGroupMembership({ groupId, userId, action: add ? "add" : "remove" }),
      "Error updating group membership."
    );
  };

  if (!user) return null;

  // Missions the user cannot reach at all are noise on a permissions page, so they are hidden
  // until the admin wants to grant one.
  const visibleMissions = showAllMissions ? missions : missions.filter((m) => !!accessFor(m.id));

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/user" className={adminCommon.backLink}>
          ← Users
        </Link>
        <h1 className={adminCommon.pageTitle}>{user.displayName}</h1>
        <p className={adminCommon.introText}>
          {user.auid} · {user.uupic}
        </p>
        {isPublic && (
          <div className={adminCommon.missionSubheader}>
            These missions are visible to <strong>every</strong> signed-in AEGIS user. See{" "}
            <Link to="/admin/publicMissions">Public Missions</Link> for the full list.
          </div>
        )}

        {error && <div className={adminCommon.statusMessage}>{error}</div>}

        {/* Public contributes grants only; group membership would make the union recursive. */}
        {!isPublic && (
          <section className={adminCommon.section}>
            <h2 className={adminCommon.sectionHeading}>Groups</h2>
            <div className={adminCommon.details}>
              <table className={adminCommon.table}>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Description</th>
                    <th>Missions</th>
                    <th>Member</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.id}>
                      <td>
                        <Link to={`/admin/group/${group.id}`}>{group.name}</Link>
                      </td>
                      <td>{group.description ?? "—"}</td>
                      <td>{group.missionCount}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={memberGroupIds.includes(group.id)}
                          onChange={(event) =>
                            handleMembershipChange(group.id, event.target.checked)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  {groups.length === 0 && (
                    <tr>
                      <td colSpan={4} className={adminCommon.emptyState}>
                        No groups exist yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Missions</h2>
          <div className={adminCommon.details}>
            <label className={adminCommon.checkboxItem}>
              <input
                type="checkbox"
                checked={showAllMissions}
                onChange={(event) => setShowAllMissions(event.target.checked)}
              />
              Show missions this user cannot reach
            </label>

            <table className={adminCommon.table}>
              <thead>
                <tr>
                  <th>Mission</th>
                  <th>Effective</th>
                  <th>Where it comes from</th>
                  <th>Direct Grant</th>
                  <th>Note on the direct grant</th>
                </tr>
              </thead>
              <tbody>
                {visibleMissions.map((mission) => {
                  const resolved = accessFor(mission.id);
                  return (
                    <tr key={mission.id}>
                      <td>{mission.name}</td>
                      <td>
                        {resolved ? (
                          <strong>{permissionLevelLabel(resolved.effectivePermLevel)}</strong>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {resolved ? (
                          <ul className={adminCommon.definitionList}>
                            {resolved.contributions.map((contribution, index) => (
                              <li
                                key={`${contribution.source}-${contribution.groupId ?? index}`}
                                className={adminCommon.definitionRow}
                                title={contribution.notes ?? ""}
                              >
                                {contribution.isEffective ? (
                                  <strong>
                                    {contributionLabel(contribution)} —{" "}
                                    {permissionLevelLabel(contribution.permLevel)} (effective)
                                  </strong>
                                ) : (
                                  <span className={adminCommon.mutedIcon}>
                                    {contributionLabel(contribution)} —{" "}
                                    {permissionLevelLabel(contribution.permLevel)}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <select
                          className={adminCommon.formInput}
                          value={directLevelFor(mission.id)}
                          onChange={(event) =>
                            handlePermLevelChange(mission.id, event.target.value)
                          }
                        >
                          <option value="">None</option>
                          {selectableLevels.map((permLevel) => (
                            <option key={permLevel} value={permLevel}>
                              {permissionLevelLabel(permLevel)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className={adminCommon.formInput}
                          disabled={!directLevelFor(mission.id)}
                          value={notesDraft.get(mission.id) ?? ""}
                          placeholder="Why this grant exists"
                          onChange={(event) =>
                            setNotesDraft((prev) =>
                              new Map(prev).set(mission.id, event.target.value)
                            )
                          }
                          onBlur={() => handleNotesSave(mission.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
                {visibleMissions.length === 0 && (
                  <tr>
                    <td colSpan={5} className={adminCommon.emptyState}>
                      This user cannot reach any mission.
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

export default UserDetail;
