import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { deleteUserGroup, getUserGroups, upsertUserGroup } from "http-client/access";
import adminCommon from "./adminCommon.module.css";

/**
 * Groups grant missions to several users at once. The reserved superUser group is listed but its
 * name is read-only and it cannot be deleted, since the resolver matches it by name.
 */
const Groups: React.FunctionComponent = () => {
  const [groups, setGroups] = useState<UserGroupSummary[]>([]);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newNotes, setNewNotes] = useState("");
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
      notes: newNotes.trim() || null,
    });
    if (response.status !== "success") {
      setError(response.message ?? "Failed to create the group.");
      return;
    }
    setNewName("");
    setNewDescription("");
    setNewNotes("");
    await loadGroups();
  };

  const handleDelete = async (group: UserGroupSummary) => {
    if (!confirm(`Delete group ${group.name} and all of its grants?`)) return;
    const response = await deleteUserGroup(group.id);
    if (response.status !== "success") {
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
          Members inherit every mission granted to the group. Membership of{" "}
          <strong>superUser</strong> confers implicit edit on every mission plus access to these
          admin pages.
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
                <input
                  id="groupDescription"
                  className={adminCommon.formInput}
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                />
              </div>
              <div className={adminCommon.formGroup}>
                <label className={adminCommon.formLabel} htmlFor="groupNotes">
                  Notes
                </label>
                <span className={adminCommon.formHint}>
                  Why this group exists. Documentation only; never used in a permission decision.
                </span>
                <input
                  id="groupNotes"
                  className={adminCommon.formInput}
                  value={newNotes}
                  onChange={(event) => setNewNotes(event.target.value)}
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
          <table className={adminCommon.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Members</th>
                <th>Missions</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td>
                    {group.name}
                    {group.isSystem && <span className={adminCommon.badgeNeutral}>Reserved</span>}
                  </td>
                  <td>{group.description ?? "—"}</td>
                  <td>{group.memberCount}</td>
                  <td>{group.isSystem ? "All" : group.missionCount}</td>
                  <td title={group.notes ?? ""}>{group.notes ? "Yes" : "—"}</td>
                  <td>
                    <div className={adminCommon.actionButtons}>
                      <Link to={`/admin/group/${group.id}`} className={adminCommon.button}>
                        Manage
                      </Link>
                      <button
                        type="button"
                        className={adminCommon.buttonDanger}
                        disabled={group.isSystem}
                        onClick={() => handleDelete(group)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
};

export default Groups;
