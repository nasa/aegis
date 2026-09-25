import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { deleteUserGroup, getUserGroups, upsertUserGroup } from "http-client/access/userGroup";
import adminCommon from "./adminCommon.module.css";

/** Groups grant missions to several users at once. There are no reserved groups. */
const Groups: React.FunctionComponent = () => {
  const [groups, setGroups] = useState<UserGroupSummary[]>([]);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    const response = await getUserGroups();
    if (response.status !== "success") {
      setError(response.message ?? "Failed to load groups.");
      return;
    }
    setGroups(response.data ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const response = await upsertUserGroup({
      name: newName.trim(),
      description: newDescription.trim() || null,
    });
    if (response.status !== "success") {
      alert(
        `Error saving user group. Please let the AEGIS developers know. Status ${response.message}`
      );
      setError(response.message ?? "Failed to create the group.");
      return;
    }
    setNewName("");
    setNewDescription("");
    await loadGroups();
  };

  const handleDelete = async (group: UserGroupSummary) => {
    if (!confirm(`Delete group ${group.name} and all of its grants?`)) return;
    const response = await deleteUserGroup({ groupId: group.id });
    if (response.status !== "success") {
      alert(
        `Error deleting user group. Please let the AEGIS developers know. Status ${response.message}`
      );
      setError(response.message ?? "Failed to delete the group.");
      return;
    }
    await loadGroups();
  };

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>Groups</h1>
        <p className={adminCommon.introText}>
          Members inherit every mission granted to the group. A user&apos;s effective level on a
          mission is the highest across their direct grant, all of their groups, and the public
          baseline.
        </p>

        {error && <div className={adminCommon.statusMessage}>{error}</div>}

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Add a group</h2>
          <div className={adminCommon.details}>
            <div className={adminCommon.form}>
              <div className={adminCommon.formGroup}>
                <label className={adminCommon.formLabel} htmlFor="groupName">
                  Name
                </label>
                <input
                  id="groupName"
                  className={adminCommon.formInput}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
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
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                />
              </div>
              <div className={adminCommon.formActions}>
                <button
                  type="button"
                  className={adminCommon.buttonPrimary}
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                >
                  Create Group
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={adminCommon.section}>
          <div className={adminCommon.details}>
            <table className={adminCommon.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Members</th>
                  <th>Missions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td>{group.name}</td>
                    <td>{group.description ?? "—"}</td>
                    <td>{group.memberCount}</td>
                    <td>{group.missionCount}</td>
                    <td>
                      <div className={adminCommon.actionButtons}>
                        <Link to={`/admin/group/${group.id}`} className={adminCommon.button}>
                          Manage
                        </Link>
                        <button
                          type="button"
                          className={adminCommon.buttonDanger}
                          onClick={() => handleDelete(group)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {groups.length === 0 && (
                  <tr>
                    <td colSpan={5} className={adminCommon.emptyState}>
                      No groups yet.
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

export default Groups;
