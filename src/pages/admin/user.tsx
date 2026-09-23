import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { getAppUsers } from "http-client/access/appUsers";
import {
  deleteMissionPermission,
  getUserAccessForAllMissions,
} from "http-client/access/missionPermission";
import { getGroupsForUser, setGroupMembership } from "http-client/access/userGroupMember";
import { PUBLIC_UUPIC } from "utils/permissionsClient";
import adminCommon from "./adminCommon.module.css";

const formatLastLogin = (value: number | null | undefined): string =>
  value ? new Date(value).toLocaleString() : "—";

/**
 * Every identity that has signed in at least once, plus the reserved Public user.
 *
 * A row exists from first login onward whether or not the person holds any permission, so the
 * Permissions column is what separates a granted user from someone who has merely visited.
 *
 * Rows are never removed. Deleting one would only make the identity reappear with a new id on the
 * person's next request while leaving every `ownerId` that referenced the old id dangling. Access
 * is taken away by revoking the grants and memberships instead, which leaves the row intact.
 */
const Users: React.FunctionComponent = () => {
  const [users, setUsers] = useState<AppUserSummary[]>([]);
  const [search, setSearch] = useState("");
  const [withPermissionsOnly, setWithPermissionsOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const response = await getAppUsers({ search, withPermissionsOnly });
    if (response.status !== "success") {
      setError(response.message ?? "Failed to load users.");
      return;
    }
    // The Public user is pinned to the top: its grants are union-ed into everyone's access, so it
    // is the single most consequential row on this page.
    const sorted = [...(response.data ?? [])].sort((a, b) => {
      if (a.uupic === PUBLIC_UUPIC) return -1;
      if (b.uupic === PUBLIC_UUPIC) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
    setUsers(sorted);
    setError(null);
  }, [search, withPermissionsOnly]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  /**
   * Strip every direct mission grant and every group membership from one user. The user row stays,
   * so they keep their identity and any entities they own; they simply drop back to the public
   * baseline. Group grants and the public baseline are managed elsewhere and are left alone.
   */
  const handleRevokeAll = async (user: AppUserSummary) => {
    if (
      !confirm(
        `Revoke every mission grant and group membership for ${user.displayName}? They will keep access to public missions.`
      )
    ) {
      return;
    }

    const [accessResponse, groupsResponse] = await Promise.all([
      getUserAccessForAllMissions(user.id),
      getGroupsForUser(user.id),
    ]);
    if (accessResponse.status !== "success" || groupsResponse.status !== "success") {
      const message =
        accessResponse.message ?? groupsResponse.message ?? "Failed to load current permissions.";
      alert(
        `Error loading the user's permissions. Please let the AEGIS developers know. Status ${message}`
      );
      setError(message);
      return;
    }

    const directGrantMissionIds = (accessResponse.data ?? [])
      .filter((access) => access.contributions.some((c) => c.source === "direct"))
      .map((access) => access.missionId);

    const responses = await Promise.all([
      ...directGrantMissionIds.map((missionId) =>
        deleteMissionPermission({ missionId, userId: user.id })
      ),
      ...(groupsResponse.data ?? []).map((group) =>
        setGroupMembership({ groupId: group.id, userId: user.id, action: "remove" })
      ),
    ]);

    const failure = responses.find((response) => response.status !== "success");
    if (failure) {
      alert(
        `Error revoking permissions. Please let the AEGIS developers know. Status ${failure.message}`
      );
      setError(failure.message ?? "Failed to revoke permissions.");
      await loadUsers();
      return;
    }

    await loadUsers();
  };

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>Users</h1>
        <p className={adminCommon.introText}>
          Everyone who has signed in at least once. Rows are never removed — an identity that signs
          in again simply reappears — so access is taken away by revoking grants and group
          memberships. A user with no grants and no group membership can still see every{" "}
          <Link to="/admin/publicMissions">public mission</Link>. Super-user access comes from the
          Launchpad role and is not granted here.
        </p>

        {error && <div className={adminCommon.statusMessage}>{error}</div>}

        <section className={adminCommon.section}>
          <div className={adminCommon.formGroup}>
            <label className={adminCommon.formLabel} htmlFor="userSearch">
              Search
            </label>
            <input
              id="userSearch"
              className={adminCommon.formInput}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by AUID or name"
            />
          </div>

          <label className={adminCommon.checkboxItem}>
            <input
              type="checkbox"
              checked={withPermissionsOnly}
              onChange={(event) => setWithPermissionsOnly(event.target.checked)}
            />
            Only users with grants or group memberships
          </label>

          <table className={adminCommon.table}>
            <thead>
              <tr>
                <th>Display Name</th>
                <th>AUID</th>
                <th>UUPIC</th>
                <th>Permissions</th>
                <th>Groups</th>
                <th>Missions</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isPublic = user.uupic === PUBLIC_UUPIC;
                return (
                  <tr key={user.id}>
                    <td>
                      {user.displayName}
                      {isPublic && (
                        <span className={adminCommon.badgeNeutral}>
                          Visible to every signed-in user
                        </span>
                      )}
                    </td>
                    <td>{user.auid}</td>
                    <td>{user.uupic}</td>
                    <td>
                      {user.hasPermissions ? (
                        <span className={adminCommon.badgeSuccess}>Granted</span>
                      ) : (
                        <span className={adminCommon.badgeNeutral}>Public only</span>
                      )}
                    </td>
                    <td>{isPublic ? "—" : user.groupCount}</td>
                    <td>{user.missionCount}</td>
                    <td>{formatLastLogin(user.lastLoginAt)}</td>
                    <td>
                      <div className={adminCommon.actionButtons}>
                        <Link to={`/admin/user/${user.id}`} className={adminCommon.button}>
                          Permissions
                        </Link>
                        <button
                          type="button"
                          className={adminCommon.buttonDanger}
                          disabled={isPublic || user.isSystem || !user.hasPermissions}
                          onClick={() => handleRevokeAll(user)}
                        >
                          Revoke All
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={8} className={adminCommon.emptyState}>
                    No users match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
};

export default Users;
