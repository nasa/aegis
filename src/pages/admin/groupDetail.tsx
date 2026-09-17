import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import {
  getGroupMembers,
  getKnownUsers,
  getMissionAccess,
  getUserGroups,
  grantMissionPermission,
  revokeMissionPermission,
  setGroupMembership,
  upsertUserGroup,
} from "http-client/access";
import { getMissionHomepageItems } from "http-client/mission";
import { PERMISSION_LEVELS, permissionLevelLabel } from "utils/permissionLevels";
import adminCommon from "./adminCommon.module.css";

/**
 * One group: its details, its members, and the missions it grants.
 *
 * The reserved superUser group hides the mission-grant section, because its members already reach
 * every mission implicitly and explicit rows would be redundant.
 */
const GroupDetail: React.FunctionComponent = () => {
  const params = useParams<{ id: string }>();
  const groupId = parseInt(params.id, 10);

  const [group, setGroup] = useState<UserGroupSummary | null>(null);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [knownUsers, setKnownUsers] = useState<KnownUser[]>([]);
  const [search, setSearch] = useState("");
  const [missions, setMissions] = useState<MissionHomepageItem[]>([]);
  const [grantLevels, setGrantLevels] = useState<Map<number, PermissionLevel>>(new Map());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!groupId) return;

    const [groupsRes, membersRes, missionsRes] = await Promise.all([
      getUserGroups(),
      getGroupMembers(groupId),
      getMissionHomepageItems(true),
    ]);

    const found = (groupsRes.data ?? []).find((g) => g.id === groupId) ?? null;
    setGroup(found);
    setNotes(found?.notes ?? "");
    setMembers(membersRes.data ?? []);
    setMissions(missionsRes.data ?? []);

    // Read each mission's grant list to find the rows belonging to this group.
    const levels = new Map<number, PermissionLevel>();
    for (const mission of missionsRes.data ?? []) {
      const accessRes = await getMissionAccess(mission.id);
      const entry = (accessRes.data?.subjects ?? []).find(
        (s) => s.subjectType === "group" && s.subjectId === groupId
      );
      if (entry) levels.set(mission.id, entry.level);
    }
    setGrantLevels(levels);
  }, [groupId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    getKnownUsers(search).then((res) => setKnownUsers(res.data ?? []));
  }, [search]);

  const handleSaveNotes = async () => {
    const response = await upsertUserGroup({ id: groupId, notes: notes.trim() || null });
    if (response.status !== "success") {
      setError(response.message ?? "Failed to save notes.");
      return;
    }
    setError(null);
  };

  const handleMembership = async (
    body: { userId?: number; knownUserId?: number },
    action: "add" | "remove"
  ) => {
    const response = await setGroupMembership({ groupId, ...body, action });
    if (response.status !== "success") {
      setError(response.message ?? "Failed to change group membership.");
      return;
    }
    setError(null);
    await loadAll();
  };

  const handleGrant = async (missionId: number, level: string) => {
    const response = level
      ? await grantMissionPermission({ missionId, groupId, level: level as PermissionLevel })
      : await revokeMissionPermission({ missionId, groupId });
    if (response.status !== "success") {
      setError(response.message ?? "Failed to change the grant.");
      return;
    }
    setError(null);
    await loadAll();
  };

  if (!group) return null;

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/group" className={adminCommon.backLink}>
          ← Groups
        </Link>
        <h1 className={adminCommon.pageTitle}>{group.name}</h1>
        <p className={adminCommon.introText}>{group.description ?? "No description."}</p>
        {group.isSystem && (
          <div className={adminCommon.missionSubheader}>
            Members of this reserved group have implicit edit on every mission and access to every
            admin page. Its name cannot be changed.
          </div>
        )}

        {error && <div className={adminCommon.statusMessage}>{error}</div>}

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Notes</h2>
          <div className={adminCommon.details}>
            <div className={adminCommon.formGroup}>
              <span className={adminCommon.formHint}>
                Why this group exists. Documentation only; never used in a permission decision.
              </span>
              <input
                className={adminCommon.formInput}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            <div className={adminCommon.formActions}>
              <button type="button" className={adminCommon.buttonPrimary} onClick={handleSaveNotes}>
                Save Notes
              </button>
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
                        onClick={() => handleMembership({ userId: member.id }, "remove")}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={3} className={adminCommon.emptyState}>
                      No members yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className={adminCommon.formGroup}>
              <label className={adminCommon.formLabel} htmlFor="memberSearch">
                Add a member
              </label>
              <span className={adminCommon.formHint}>
                Searches identities that have signed in at least once. Adding one promotes them to a
                managed user.
              </span>
              <input
                id="memberSearch"
                className={adminCommon.formInput}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by AUID or name"
              />
            </div>
            <table className={adminCommon.tableCompact}>
              <tbody>
                {knownUsers.slice(0, 20).map((known) => (
                  <tr key={known.id}>
                    <td>{known.displayName}</td>
                    <td>{known.auid}</td>
                    <td>
                      <button
                        type="button"
                        className={adminCommon.button}
                        onClick={() => handleMembership({ knownUserId: known.id }, "add")}
                      >
                        Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {!group.isSystem && (
          <section className={adminCommon.section}>
            <h2 className={adminCommon.sectionHeading}>Missions</h2>
            <div className={adminCommon.details}>
              <table className={adminCommon.table}>
                <thead>
                  <tr>
                    <th>Mission</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {missions.map((mission) => (
                    <tr key={mission.id}>
                      <td>{mission.name}</td>
                      <td>
                        <select
                          className={adminCommon.formInput}
                          value={grantLevels.get(mission.id) ?? ""}
                          onChange={(event) => handleGrant(mission.id, event.target.value)}
                        >
                          <option value="">None</option>
                          {PERMISSION_LEVELS.map((level) => (
                            <option key={level} value={level}>
                              {permissionLevelLabel(level)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
};

export default GroupDetail;
