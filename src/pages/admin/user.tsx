import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";

import { getAppUsers } from "http-client/access/appUsers";
import { PUBLIC_UUPIC } from "utils/permissionsClient";
import adminCommon from "./adminCommon.module.css";

const formatLastLogin = (value: number | null | undefined): string =>
  value ? new Date(value).toLocaleString() : "—";

type SortColumn = "displayName" | "auid" | "uupic" | "hasPermissions" | "lastLoginAt";

const SORTABLE_COLUMNS: { column: SortColumn; label: string }[] = [
  { column: "displayName", label: "Display Name" },
  { column: "auid", label: "AUID" },
  { column: "uupic", label: "UUPIC" },
  { column: "hasPermissions", label: "Permissions" },
  { column: "lastLoginAt", label: "Last Login" },
];

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
  const navigate = useNavigate();

  const [users, setUsers] = useState<AppUserSummary[]>([]);
  const [search, setSearch] = useState("");
  const [withPermissionsOnly, setWithPermissionsOnly] = useState(true);
  const [sortColumn, setSortColumn] = useState<SortColumn>("displayName");
  const [sortAscending, setSortAscending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const response = await getAppUsers({ search, withPermissionsOnly });
    if (response.status !== "success") {
      setError(response.message ?? "Failed to load users.");
      return;
    }
    setUsers(response.data ?? []);
    setError(null);
  }, [search, withPermissionsOnly]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortAscending((previous) => !previous);
      return;
    }
    setSortColumn(column);
    setSortAscending(true);
  };

  // The Public user is pinned to the top regardless of the sort: its grants are union-ed into
  // everyone's access, so it is the single most consequential row on this page.
  const sortedUsers = useMemo(() => {
    const direction = sortAscending ? 1 : -1;

    return [...users].sort((a, b) => {
      if (a.uupic === PUBLIC_UUPIC) return -1;
      if (b.uupic === PUBLIC_UUPIC) return 1;

      switch (sortColumn) {
        case "hasPermissions":
          return (Number(a.hasPermissions) - Number(b.hasPermissions)) * direction;
        case "lastLoginAt":
          return ((a.lastLoginAt ?? 0) - (b.lastLoginAt ?? 0)) * direction;
        default:
          return a[sortColumn].localeCompare(b[sortColumn]) * direction;
      }
    });
  }, [users, sortColumn, sortAscending]);

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>Users</h1>
        <p className={adminCommon.introText}>
          Everyone who has signed in at least once. Rows are never removed. A user with permissions
          can still see missions granted to the Public user. Super-user access comes from the
          Launchpad role.
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
              style={{ maxWidth: "300px" }}
            />
          </div>
          <br />
          <label className={adminCommon.checkboxItem}>
            <input
              type="checkbox"
              checked={withPermissionsOnly}
              onChange={(event) => setWithPermissionsOnly(event.target.checked)}
            />
            Show only users with grants or group memberships
          </label>

          <div className={adminCommon.details}>
            <table className={adminCommon.table}>
              <thead>
                <tr>
                  {SORTABLE_COLUMNS.map(({ column, label }) => (
                    <th
                      key={column}
                      className={adminCommon.sortableHeader}
                      onClick={() => handleSort(column)}
                    >
                      {label}
                      {sortColumn === column && (
                        <span className={adminCommon.sortIndicator}>
                          {sortAscending ? "▲" : "▼"}
                        </span>
                      )}
                    </th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((user) => {
                  return (
                    <tr key={user.id}>
                      <td>{user.displayName}</td>
                      <td>{user.auid}</td>
                      <td>{user.uupic}</td>
                      <td>
                        {user.hasPermissions ? (
                          <span className={adminCommon.badgeSuccess}>Granted</span>
                        ) : (
                          <span className={adminCommon.badgeNeutral}>Public only</span>
                        )}
                      </td>
                      <td>{formatLastLogin(user.lastLoginAt)}</td>
                      <td>
                        <button
                          className={adminCommon.button}
                          type="button"
                          onClick={() => {
                            navigate(`/admin/user/${user.id}`);
                          }}
                        >
                          Permissions
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {sortedUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className={adminCommon.emptyState}>
                      No users match.
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

export default Users;
