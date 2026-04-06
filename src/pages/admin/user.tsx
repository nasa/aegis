import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import { deleteAppUsers, getAppUsers, upsertAppUsers } from "../../http-client/appUser";
import React from "react";
import { generateBlankAppUser } from "store/storeUtils/appUser";
import { getAccurateNow } from "utils/formatting";
import { getAutomergeDocListing } from "http-client/docListing";
import { useRepo } from "@automerge/automerge-repo-react-hooks";
import type { AutomergeUrl, DocHandle } from "@automerge/automerge-repo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers } from "@fortawesome/free-solid-svg-icons";
import adminCommon from "./adminCommon.module.css";

const User: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const automergeRepo = useRepo();
  const [userList, setUserList] = useState<AppUser[]>([]);
  const [user, setUser] = useState<AppUser>();
  const [editMode, setEditMode] = useState<boolean>(false);
  const [infoMessage, setInfoMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [createMode, setCreateMode] = useState<boolean>(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [automergeDocList, setAutomergeDocList] = useState<AutomergeDocListing[]>([]);
  const [missionList, setMissionList] = useState<{ id: number; name: string }[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  //on load check login and mission id
  useEffect(() => {
    // This is a possible solution to the eslint error "No floating promises"
    async function adminCheck() {
      const response = await isLoggedIn();
      if (response.status === "success" && response.data.isSuperAdmin) {
        setIsSuperAdmin(true);
        // Get a list of users from the database
        const users: AppUser[] = (await getAppUsers()).data;
        setUserList(users.sort((a, b) => a.id - b.id));

        // get a list of all automerge mission records
        const automergeDocListings: AutomergeDocListing[] = (await getAutomergeDocListing()).data;
        setAutomergeDocList(automergeDocListings);

        const missionNamesAndIds = [];
        // get their names
        for (const record of automergeDocListings) {
          const missionDocHandle: DocHandle<Mission> = await automergeRepo.find(
            record.automergeUrl as AutomergeUrl
          );
          const mission = missionDocHandle.doc();
          missionNamesAndIds.push({ id: record.missionId, name: mission.name });
        }
        setMissionList(missionNamesAndIds);
      } else {
        navigate("/");
      }
    }
    adminCheck().catch(() => {
      // Something went wrong. Eventually would like a logger here.
    });
  }, [automergeRepo, navigate]);

  const handleEdit = (user: AppUser) => {
    let permissionList: Permission[];

    // if superadmin, give all permissions
    if (user.isSuperAdmin) {
      permissionList = automergeDocList.map((amRecord) => {
        return {
          permissions: { edit: true, view: true },
          missionId: amRecord.missionId,
        };
      });
    } else {
      permissionList = automergeDocList.map((amRecord) => {
        if (user.permissionList?.find((p) => p.missionId === amRecord.missionId)) {
          return user.permissionList.find((p) => p.missionId === amRecord.missionId);
        } else {
          return {
            permissions: { edit: false, view: false },
            missionId: amRecord.missionId,
          };
        }
      });
    }

    setUser({ ...user, permissionList });
    setEditMode(true);
  };

  const handleDelete = async (user: AppUser) => {
    const deleteRes = await deleteAppUsers([user.id]);
    if (deleteRes.status === "success") {
      setUserList(userList.filter((u) => u.id !== user.id));
      setDeleteTarget(null);
    } else {
      alert("There was an error deleting user");
      setDeleteTarget(null);
    }
  };

  const handleSubmit = async () => {
    //validate
    if (user.username.length < 3 || user.password.length < 3) {
      setErrorMessage("Username and password must be at least 3 characters long");
      return;
    }

    //only save missions a users has perms to
    //super admin always has perms to everything. No need to set it
    let permList = null;
    if (!user.isSuperAdmin) {
      permList = user.permissionList.filter((p) => {
        return p.permissions.view || p.permissions.edit;
      });
    }
    const updatedUser = await upsertAppUsers([
      {
        ...user,
        permissionList: permList,
        updatedAt: getAccurateNow().toISOString(),
      },
    ]);
    if (updatedUser.status === "success") {
      setErrorMessage("");
      if (createMode) {
        setCreateMode(!createMode);
        handleEdit(updatedUser.data[0]);
        setInfoMessage("User created successfully");
      } else {
        setInfoMessage("User updated successfully");
      }
    } else {
      setErrorMessage("Error updating user");
    }
  };

  const handleCreate = () => {
    setCreateMode(!createMode);

    const permissionList = automergeDocList.map((amRecord) => {
      return {
        permissions: { edit: false, view: false },
        missionId: amRecord.missionId,
      };
    });
    const blankUser: AppUser = generateBlankAppUser({ permissionList });

    // create a blank user
    setUser({
      ...user,
      ...blankUser,
    });
  };

  const closeModal = () => {
    setEditMode(false);
    setCreateMode(false);
    setUser(undefined);
    setInfoMessage("");
    setErrorMessage("");
    getAppUsers().then((users) => {
      setUserList(users.data.sort((a, b) => a.id - b.id));
    });
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return (
      d.toLocaleDateString() +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  const renderModal = () => {
    if (!editMode && !createMode) return null;
    return (
      <div className={adminCommon.modalOverlay} onClick={closeModal}>
        <div className={adminCommon.modal} onClick={(e) => e.stopPropagation()}>
          <div className={adminCommon.modalHeader}>
            <h2 className={adminCommon.modalTitle}>{createMode ? "Create User" : "Edit User"}</h2>
            <button className={adminCommon.modalClose} onClick={closeModal} title="Close">
              ✕
            </button>
          </div>
          <div className={adminCommon.modalBody}>
            <div className={adminCommon.form}>
              <div className={adminCommon.formGroup}>
                <label className={adminCommon.formLabel} htmlFor="username">
                  Username
                </label>
                <input
                  className={adminCommon.formInput}
                  onChange={(e) => setUser({ ...user, username: e.target.value })}
                  value={user?.username || ""}
                  type="text"
                  id="username"
                  name="username"
                  disabled={user?.id === 2}
                />
              </div>
              <div className={adminCommon.formGroup}>
                <label className={adminCommon.formLabel} htmlFor="password">
                  Password
                </label>
                <input
                  className={adminCommon.formInput}
                  onChange={(e) => setUser({ ...user, password: e.target.value })}
                  value={user?.password || ""}
                  type="password"
                  id="password"
                  name="password"
                  disabled={user?.id === 2}
                />
              </div>

              <div className={adminCommon.formGroup}>
                <label className={adminCommon.formLabel}>Roles</label>
                <div className={adminCommon.checkboxGroup}>
                  <label className={adminCommon.checkboxItem}>
                    <input
                      type="checkbox"
                      checked={user?.isSuperAdmin || user?.isAdmin || false}
                      onChange={(e) => setUser({ ...user, isAdmin: e.target.checked })}
                      disabled={user?.isSuperAdmin || user?.id === 2}
                    />
                    Admin
                  </label>
                </div>
              </div>

              <div className={adminCommon.formGroup}>
                <label className={adminCommon.formLabel}>Mission Access</label>
                <div
                  style={{
                    border: "1px solid var(--admin-border)",
                    borderRadius: "var(--admin-radius)",
                    overflow: "hidden",
                    background: "var(--admin-bg)",
                  }}
                >
                  <table
                    className={adminCommon.table}
                    style={{
                      tableLayout: "fixed",
                      width: "100%",
                      borderCollapse: "separate",
                      borderSpacing: 0,
                    }}
                  >
                    <colgroup>
                      <col />
                      <col style={{ width: "60px" }} />
                      <col style={{ width: "60px" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Mission</th>
                        <th>View</th>
                        <th>Edit</th>
                      </tr>
                    </thead>
                  </table>
                  <div
                    style={{ maxHeight: "200px", overflowY: "auto", background: "var(--admin-bg)" }}
                  >
                    <table
                      className={adminCommon.table}
                      style={{
                        tableLayout: "fixed",
                        width: "100%",
                        borderCollapse: "separate",
                        borderSpacing: 0,
                      }}
                    >
                      <colgroup>
                        <col />
                        <col style={{ width: "60px" }} />
                        <col style={{ width: "60px" }} />
                      </colgroup>
                      <tbody>
                        {missionList.map((mission) => (
                          <tr key={mission.id}>
                            <td>{mission.name}</td>
                            <td>
                              <label className={adminCommon.checkboxItem}>
                                <input
                                  type="checkbox"
                                  onChange={() => {
                                    const userPermissionUpdated = user.permissionList.map((p) => {
                                      if (p.missionId === mission.id) {
                                        p.permissions.view = !p.permissions.view;
                                      }
                                      return p;
                                    });
                                    setUser({ ...user, permissionList: userPermissionUpdated });
                                  }}
                                  checked={
                                    user?.permissionList?.some(
                                      (p) => p.missionId === mission.id && p.permissions.view
                                    ) || false
                                  }
                                  disabled={user?.isSuperAdmin}
                                />
                              </label>
                            </td>
                            <td>
                              <label className={adminCommon.checkboxItem}>
                                <input
                                  type="checkbox"
                                  onChange={() => {
                                    const userPermissionUpdated = user.permissionList.map((p) => {
                                      if (p.missionId === mission.id) {
                                        p.permissions.edit = !p.permissions.edit;
                                        if (p.permissions.edit) {
                                          p.permissions.view = true;
                                        }
                                      }
                                      return p;
                                    });
                                    setUser({ ...user, permissionList: userPermissionUpdated });
                                  }}
                                  checked={
                                    user?.permissionList?.some(
                                      (p) => p.missionId === mission.id && p.permissions.edit
                                    ) || false
                                  }
                                  disabled={user?.isSuperAdmin || user?.id === 2}
                                />
                              </label>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {errorMessage && <p className={adminCommon.statusDisconnected}>{errorMessage}</p>}
            {infoMessage && <p className={adminCommon.statusConnected}>{infoMessage}</p>}
          </div>
          <div className={adminCommon.modalFooter}>
            <button className={adminCommon.buttonCancel} type="button" onClick={closeModal}>
              Cancel
            </button>
            <button className={adminCommon.buttonPrimary} type="button" onClick={handleSubmit}>
              {createMode ? "Create" : "Save"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {isSuperAdmin && (
        <main className={adminCommon.page}>
          <div className={adminCommon.container}>
            <Link to="/admin" className={adminCommon.backLink}>
              ← Admin
            </Link>
            <h1 className={adminCommon.pageTitle}>User Management</h1>

            <section className={adminCommon.section}>
              <h2>
                <FontAwesomeIcon icon={faUsers} className={adminCommon.mutedIcon} />
                Users
              </h2>
              <div className={adminCommon.details}>
                <div className={adminCommon.formActions} style={{ marginBottom: 12 }}>
                  <button className={adminCommon.buttonPrimary} onClick={() => handleCreate()}>
                    + Add User
                  </button>
                </div>
                <table className={`${adminCommon.table} ${adminCommon.tableCompact}`}>
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Name</th>
                      <th scope="col">Created</th>
                      <th scope="col">Updated</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userList.map((u) => (
                      <tr key={u.id}>
                        <td>{u.id}</td>
                        <td style={{ color: "#f1f5f9", fontWeight: 600 }}>{u.username}</td>
                        <td>{formatDate(u.createdAt)}</td>
                        <td>{formatDate(u.updatedAt)}</td>
                        <td>
                          <div className={adminCommon.formActions}>
                            <button className={adminCommon.button} onClick={() => handleEdit(u)}>
                              Edit
                            </button>
                            {u.id !== 1 && u.id !== 2 && (
                              <button
                                className={adminCommon.buttonDanger}
                                onClick={() => setDeleteTarget(u)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {renderModal()}

          {deleteTarget && (
            <div className={adminCommon.confirmOverlay}>
              <div className={adminCommon.confirmDialog}>
                <h3>Delete User</h3>
                <p>
                  Are you sure you want to delete <strong>{deleteTarget.username}</strong>? This
                  action cannot be undone.
                </p>
                <div className={adminCommon.confirmActions}>
                  <button
                    className={adminCommon.buttonCancel}
                    onClick={() => setDeleteTarget(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className={adminCommon.buttonDanger}
                    onClick={() => handleDelete(deleteTarget)}
                    style={{ padding: "10px 24px", fontSize: "0.95rem" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}
    </>
  );
};

export default User;
