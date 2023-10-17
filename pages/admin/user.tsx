import { NextPage } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isLoggedIn } from "http-client/login";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";
import { deleteUsers, getUsers, upsertUsers } from "../../http-client/user";
import { faEdit, faTrashCan, faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { getMissions } from "../../http-client/mission";
import React from "react";
import { roundDateToSecond } from "utils/formatting";

const User: NextPage = () => {
  const router = useRouter();
  const [userList, setUserList] = useState<User[]>([]);
  const [user, setUser] = useState<User>();
  const [editMode, setEditMode] = useState<boolean>(false);
  const [infoMessage, setInfoMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [createMode, setCreateMode] = useState<boolean>(false);
  const [isSuperadmin, setIsSuperAdmin] = useState<boolean>(false);
  const [missionList, setMissionList] = useState<Mission[]>([]);

  //on load check login and mission id
  useEffect(() => {
    // This is a possible solution to the esllint error "No floating promises"
    async function adminCheck() {
      const response = await isLoggedIn();
      if (response.status === "success" && response.data.user.isSuperAdmin) {
        setIsSuperAdmin(true);
        // Get a list of users from the database
        const users: User[] = (await getUsers()).data;
        setUserList(users.sort((a, b) => a.id - b.id));
        const missions: Mission[] = (await getMissions()).data;
        setMissionList(missions);
      } else {
        router.push("/");
      }
    }
    adminCheck().catch(() => {
      // Something went wrong. Eventually would like a logger here.
    });
  }, [router]);

  const handleEdit = (user: User) => {
    let permissionList: Permission[];

    // if superadmin, give all permissions
    if (user.isSuperAdmin) {
      permissionList = missionList.map((mission) => {
        return {
          permissions: { edit: true, view: true },
          missionId: mission.id,
        };
      });
    } else {
      permissionList = missionList.map((mission) => {
        if (user.permissionList?.find((p) => p.missionId === mission.id)) {
          return user.permissionList.find((p) => p.missionId === mission.id);
        } else {
          return {
            permissions: { edit: false, view: false },
            missionId: mission.id,
          };
        }
      });
    }

    setUser({ ...user, permissionList });
    setEditMode(true);
  };

  const handleDelete = async (user: User) => {
    const deleteRes = await deleteUsers([user.id]);
    if (deleteRes.status === "success") {
      setUserList(userList.filter((u) => u.id !== user.id));
    } else {
      alert("There was an error deleting user");
    }
  };

  const handleBack = async () => {
    setEditMode(false);
    setCreateMode(false);
    setUser(undefined);
    setInfoMessage("");
    await getUsers().then((users) => {
      setUserList(users.data.sort((a, b) => a.id - b.id));
    });
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
    const updatedUser = await upsertUsers([
      {
        ...user,
        permissionList: permList,
        updatedAt: roundDateToSecond(new Date()).toISOString(),
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

    const permissionList = missionList.map((mission) => {
      return {
        permissions: { edit: false, view: false },
        missionId: mission.id,
      };
    });

    // create a blank user
    setUser({
      ...user,
      isAdmin: false,
      isSuperAdmin: false,
      username: "",
      password: "",
      permissionList,
      createdAt: roundDateToSecond(new Date()).toISOString(),
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    });
  };

  return (
    <>
      {isSuperadmin && (
        <div className={styles.pageStyle}>
          <div className={styles.header}>
            <Header />
          </div>
          <div className={styles.bodyContent}>
            {editMode ? (
              <>
                <h1 className={styles.centerHeader}>Edit User</h1>
                <div className={styles.backButton}>
                  <FontAwesomeIcon icon={faArrowAltCircleLeft} size="xl" onClick={handleBack} />
                </div>
              </>
            ) : createMode ? (
              <>
                <h1 className={styles.centerHeader}>Create User</h1>
                <div className={styles.backButton}>
                  <FontAwesomeIcon icon={faArrowAltCircleLeft} size="xl" onClick={handleBack} />
                </div>
              </>
            ) : (
              <>
                <div className={styles.backButton}>
                  <FontAwesomeIcon icon={faArrowAltCircleLeft} size="xl" onClick={router.back} />
                </div>
                <h1 className={styles.centerHeader}>User List</h1>
                <div
                  className={styles.addButton}
                  onClick={() => {
                    handleCreate();
                  }}
                >
                  <FontAwesomeIcon icon={faPlus} size={"lg"} /> Add User
                </div>
              </>
            )}

            {editMode || createMode ? (
              <>
                <div className={styles.formContainer}>
                  <form className={styles.form}>
                    <div className={styles.formGroup}>
                      <label htmlFor="username">Username</label>
                      <input
                        className={styles.input}
                        onChange={(e) => {
                          setUser({ ...user, username: e.target.value });
                        }}
                        value={user.username}
                        type="text"
                        id="username"
                        name="username"
                        disabled={user.id === 2}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="password">Password</label>
                      <input
                        className={styles.input}
                        onChange={(e) => {
                          setUser({ ...user, password: e.target.value });
                        }}
                        value={user.password}
                        type="password"
                        id="password"
                        name="password"
                        disabled={user.id === 2}
                      />
                    </div>
                    <div className={styles.formEnd}>
                      <button type="button" onClick={handleSubmit}>
                        Save
                      </button>
                    </div>
                    {errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}
                    {infoMessage && <p className={styles.successMessage}>{infoMessage}</p>}
                  </form>
                  <div className={styles.form}>
                    <div className={styles.formGroup}>
                      <table>
                        <thead>
                          <tr>
                            <th>Permissions</th>
                            <th>Access</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Admin</td>
                            <td>
                              <input
                                type="checkbox"
                                id="admin"
                                name="permission"
                                value="admin"
                                checked={user.isSuperAdmin || user.isAdmin}
                                onChange={(e) => {
                                  setUser({ ...user, isAdmin: e.target.checked });
                                }}
                                disabled={user.isSuperAdmin || user.id === 2}
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <table>
                        <thead>
                          <tr>
                            <th>Mission Access</th>
                            <th>View</th>
                            <th>Edit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {missionList.map((mission) => {
                            return (
                              <tr key={mission.id}>
                                <td>{mission.name}</td>
                                <td>
                                  <input
                                    type="checkbox"
                                    id={mission.id.toString() + "-view"}
                                    name="permission-view"
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
                                      user.permissionList &&
                                      user.permissionList.some(
                                        (p) => p.missionId === mission.id && p.permissions.view
                                      )
                                    }
                                    disabled={user.isSuperAdmin}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="checkbox"
                                    id={mission.id.toString() + "-edit"}
                                    name="permission-edit"
                                    onChange={() => {
                                      const userPermissionUpdated = user.permissionList.map((p) => {
                                        if (p.missionId === mission.id) {
                                          p.permissions.edit = !p.permissions.edit;
                                          if (p.permissions.edit) {
                                            //edit automatically grants view
                                            p.permissions.view = true;
                                          }
                                        }
                                        return p;
                                      });
                                      setUser({ ...user, permissionList: userPermissionUpdated });
                                    }}
                                    checked={
                                      user.permissionList &&
                                      user.permissionList.some(
                                        (p) => p.missionId === mission.id && p.permissions.edit
                                      )
                                    }
                                    disabled={user.isSuperAdmin || user.id === 2}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Name</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {userList.map((user) => {
                    return (
                      <tr key={user.id}>
                        <th scope="row">{user.id}</th>
                        <td>{user.username}</td>
                        <td className={styles.actionList}>
                          <FontAwesomeIcon
                            icon={faEdit}
                            onClick={() => {
                              handleEdit(user);
                            }}
                          />
                          {user.id !== 1 && user.id !== 2 && (
                            <FontAwesomeIcon
                              icon={faTrashCan}
                              onClick={async () => {
                                await handleDelete(user);
                              }}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default User;
