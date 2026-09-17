import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import {
  getAppUsers,
  getUserAccess,
  getUserGroups,
  grantMissionPermission,
  revokeMissionPermission,
  setGroupMembership,
} from "http-client/access";
import { getMissionHomepageItems } from "http-client/mission";
import { PERMISSION_LEVELS, permissionLevelLabel, PUBLIC_UUPIC } from "utils/permissionLevels";
import adminCommon from "./adminCommon.module.css";

/**
 * One managed user: their group memberships and every mission they can reach.
 *
 * Only direct grants are editable here. Group-derived and public rows are shown read-only, because
 * otherwise an admin sees missions listed against a user with no explanation of why.
 */
const UserDetail: React.FunctionComponent = () => {
  const params = useParams<{ id: string }>();
  const userId = parseInt(params.id, 10);

  const [user, setUser] = useState<AppUser | null>(null);
  const [access, setAccess] = useState<ResolvedMissionAccess[]>([]);
  const [groups, setGroups] = useState<UserGroupSummary[]>([]);
  const [memberGroupIds, setMemberGroupIds] = useState<number[]>([]);
  const [missionNames, setMissionNames] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const isPublic = user?.uupic === PUBLIC_UUPIC;
  // Public is capped at viewer, which is what keeps the union safe: it can add missions to
  // everyone's access but can never hand out edit rights.
  const selectableLevels: PermissionLevel[] = isPublic ? ["viewer"] : PERMISSION_LEVELS;

  const loadAll = useCallback(async () => {
    if (!userId) return;

    const [usersRes, accessRes, groupsRes, missionsRes] = await Promise.all([
      getAppUsers(false),
      getUserAccess(userId),
      getUserGroups(),
      getMissionHomepageItems(true),
    ]);

    setUser((usersRes.data ?? []).find((u) => u.id === userId) ?? null);
    setAccess(accessRes.data ?? []);
    setGroups(groupsRes.data ?? []);
    setMissionNames(new Map((missionsRes.data ?? []).map((m) => [m.id, m.name])));

    // Group membership is derived from the access list's "group" rows plus an explicit lookup,
    // so a group with no mission grants still shows up.
    const memberships: number[] = [];
    for (const group of groupsRes.data ?? []) {
      const members = await fetch(`/api/v1/userGroup/member?groupId=${group.id}`).then((r) =>
        r.json()
      );
      if ((members.data ?? []).some((m: AppUser) => m.id === userId)) memberships.push(group.id);
    }
    setMemberGroupIds(memberships);
  }, [userId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const directLevelFor = (missionId: number): PermissionLevel | "" => {
    const entry = access.find((a) => a.missionId === missionId && a.source === "direct");
    return entry?.level ?? "";
  };

  const handleLevelChange = async (missionId: number, level: string) => {
    const response = level
      ? await grantMissionPermission({ missionId, userId, level: level as PermissionLevel })
      : await revokeMissionPermission({ missionId, userId });

    if (response.status !== "success") {
      setError(response.message ?? "Failed to change the grant.");
      return;
    }
    setError(null);
    await loadAll();
  };

  const handleMembershipChange = async (groupId: number, add: boolean) => {
    const response = await setGroupMembership({
      groupId,
      userId,
      action: add ? "add" : "remove",
    });
    if (response.status !== "success") {
      setError(response.message ?? "Failed to change group membership.");
      return;
    }
    setError(null);
    await loadAll();
  };

  const sourceLabel = (entry: ResolvedMissionAccess): string => {
    if (entry.source === "direct") return "Direct";
    if (entry.source === "public") return "Public";
    return `Via group ${entry.groupName ?? entry.groupId}`;
  };

  if (!user) return null;

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
            These missions are visible to <strong>every</strong> signed-in AEGIS user.
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
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Missions</h2>
          <div className={adminCommon.details}>
            <table className={adminCommon.table}>
              <thead>
                <tr>
                  <th>Mission</th>
                  <th>Direct Grant</th>
                  <th>Effective Level</th>
                  <th>Source</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {[...missionNames.entries()].map(([missionId, name]) => {
                  const resolved = access.find((a) => a.missionId === missionId);
                  return (
                    <tr key={missionId}>
                      <td>{name}</td>
                      <td>
                        <select
                          className={adminCommon.formInput}
                          value={directLevelFor(missionId)}
                          onChange={(event) => handleLevelChange(missionId, event.target.value)}
                        >
                          <option value="">None</option>
                          {selectableLevels.map((level) => (
                            <option key={level} value={level}>
                              {permissionLevelLabel(level)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{resolved ? permissionLevelLabel(resolved.level) : "—"}</td>
                      <td>{resolved ? sourceLabel(resolved) : "—"}</td>
                      <td title={resolved?.notes ?? ""}>{resolved?.notes ? "Yes" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
};

export default UserDetail;
