import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { deleteAppUsers, getAppUsers } from "http-client/access";
import { PUBLIC_UUPIC } from "utils/permissionLevels";
import adminCommon from "./adminCommon.module.css";

const formatLastLogin = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleString() : "—";

/**
 * Managed users: everyone holding at least one mission grant or group membership, plus the
 * reserved Public principal.
 *
 * There is no Active column and no deactivate action. Removing every grant demotes a user back to
 * the known-identity pool, which is the only "off" state.
 */
const Users: React.FunctionComponent = () => {
  const [users, setUsers] = useState<AppUserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const response = await getAppUsers(true);
    if (response.status !== "success") {
      setError(response.message ?? "Failed to load users.");
      return;
    }
    // The Public row is pinned to the top: its grants are unioned into everyone's access, so it
    // is the single most consequential row on this page.
    const sorted = [...(response.data ?? [])].sort((a, b) => {
      if (a.uupic === PUBLIC_UUPIC) return -1;
      if (b.uupic === PUBLIC_UUPIC) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
    setUsers(sorted);
    setError(null);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleDelete = async (user: AppUserSummary) => {
    if (!confirm(`Remove ${user.displayName} and all of their grants? This cannot be undone.`)) {
      return;
    }
    const response = await deleteAppUsers([user.id]);
    if (response.status !== "success") {
      setError(response.message ?? "Failed to delete user.");
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
          Users with explicit standing. Grant a mission or a group membership to someone from{" "}
          <Link to="/admin/knownUsers">Known Identities</Link>; removing their last grant returns
          them to that pool automatically.
        </p>

        {error && <div className={adminCommon.statusMessage}>{error}</div>}

        <section className={adminCommon.section}>
          <table className={adminCommon.table}>
            <thead>
              <tr>
                <th>Display Name</th>
                <th>AUID</th>
                <th>UUPIC</th>
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
                    <td>{isPublic ? "—" : user.groupCount}</td>
                    <td>{user.missionCount}</td>
                    <td>{formatLastLogin(user.lastLoginAt)}</td>
                    <td>
                      <div className={adminCommon.actionButtons}>
                        <Link to={`/admin/user/${user.id}`} className={adminCommon.button}>
                          Edit
                        </Link>
                        <button
                          type="button"
                          className={adminCommon.buttonDanger}
                          disabled={isPublic || user.isSystem}
                          onClick={() => handleDelete(user)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className={adminCommon.emptyState}>
                    No managed users yet.
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
