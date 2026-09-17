import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { deleteKnownUsers, getKnownUsers, promoteKnownUser } from "http-client/access";
import adminCommon from "./adminCommon.module.css";

/**
 * Identities that have signed in but hold no grants.
 *
 * Deleting is cosmetic: the identity reappears on that person's next authenticated request. The
 * page exists so the pool can be pruned of one-off visitors.
 */
const KnownUsers: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<KnownUser[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const response = await getKnownUsers(search);
    if (response.status !== "success") {
      setError(response.message ?? "Failed to load known identities.");
      return;
    }
    setUsers(response.data ?? []);
    setError(null);
  }, [search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handlePromote = async (known: KnownUser) => {
    const response = await promoteKnownUser(known.id);
    if (response.status !== "success") {
      setError(response.message ?? "Failed to promote the identity.");
      return;
    }
    navigate(`/admin/user/${response.data.id}`);
  };

  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;
    if (!confirm(`Remove ${selected.length} identities from the pool?`)) return;

    const response = await deleteKnownUsers(selected);
    if (response.status !== "success") {
      setError(response.message ?? "Failed to delete identities.");
      return;
    }
    setSelected([]);
    await loadUsers();
  };

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>Known Identities</h1>
        <p className={adminCommon.introText}>
          Everyone who has signed in but holds no grants. They can already see every public mission.
          Promoting one moves them to <Link to="/admin/user">Users</Link> so they can be granted
          more.
        </p>

        {error && <div className={adminCommon.statusMessage}>{error}</div>}

        <section className={adminCommon.section}>
          <div className={adminCommon.formGroup}>
            <label className={adminCommon.formLabel} htmlFor="knownSearch">
              Search
            </label>
            <input
              id="knownSearch"
              className={adminCommon.formInput}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by AUID or name"
            />
          </div>

          <div className={adminCommon.actionButtons}>
            <button
              type="button"
              className={adminCommon.buttonDanger}
              disabled={selected.length === 0}
              onClick={handleDeleteSelected}
            >
              Delete Selected ({selected.length})
            </button>
          </div>

          <table className={adminCommon.table}>
            <thead>
              <tr>
                <th></th>
                <th>Display Name</th>
                <th>AUID</th>
                <th>UUPIC</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((known) => (
                <tr key={known.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(known.id)}
                      onChange={() => toggle(known.id)}
                    />
                  </td>
                  <td>{known.displayName}</td>
                  <td>{known.auid}</td>
                  <td>{known.uupic}</td>
                  <td>{new Date(known.lastLoginAt).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      className={adminCommon.button}
                      onClick={() => handlePromote(known)}
                    >
                      Promote
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className={adminCommon.emptyState}>
                    No known identities.
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

export default KnownUsers;
