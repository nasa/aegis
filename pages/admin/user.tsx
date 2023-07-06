import { NextPage } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isAdmin } from "http-client/login";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";
import { deleteUser, getUsers, upsertUser } from "../../http-client/user";
import { faEdit, faTrashCan, faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { getMissions } from "../../http-client/mission";
import { ChangeEvent } from "react";
import React from "react";

const User: NextPage = () => {
  const router = useRouter();
  const [userList, setUserList] = useState<User[]>([]);
  const [user, setUser] = useState<User>();
  const [editMode, setEditMode] = useState<boolean>(false);
  const [infoMessage, setInfoMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [createMode, setCreateMode] = useState<boolean>(false);
  const [admin, setAdmin] = useState<boolean>(false);
  const [missionList, setMissionList] = useState<Mission[]>([]);

  //on load check login and mission id
  useEffect(() => {
    // This is a possible solution to the esllint error "No floating promises"
    async function adminCheck() {
      const adminResponse = await isAdmin(); //check user is admin
      const user: User = adminResponse.data["user"];
      if (user.id !== 1) {
        await router.push("/"); //not our super user. Redirect to homepage
      } else {
        setAdmin(true);
        // Get a list of users from the database
        const users: User[] = (await getUsers()).data;
        setUserList(users.sort((a, b) => a.id - b.id));
        const missions: Mission[] = (await getMissions()).data;
        setMissionList(missions);
      }
    }
    adminCheck().catch(() => {
      // Something went wrong. Eventually would like a logger here.
    });
  }, [router]);

  const handleEdit = (user: User) => {
    let permissionList: Permission[];

    // if superadmin, give all permissions
    if (user.id === 1) {
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
    setEditMode(!editMode);
  };

  const handleDelete = async (user: User) => {
    const deletedUser = await deleteUser(user.id);
    if (deletedUser) {
      setUserList(userList.filter((u) => u.id !== user.id));
    } else {
      alert("There was an error deleting user");
    }
  };

  const handleBack = async () => {
    setEditMode(false);
    setCreateMode(false);
    await getUsers().then((users) => {
      setUserList(users.data.sort((a, b) => a.id - b.id));
    });
    setUser(undefined);
    setInfoMessage("");
  };

  const handleSubmit = async () => {
    if (user.username.length < 3 || user.password.length < 3) {
      setErrorMessage("Username and password must be at least 3 characters long");
      return;
    }
    const updatedUser = await upsertUser(user);
    if (updatedUser.status === "success") {
      setUserList(
        userList.map((u) => {
          if (u.id === updatedUser.data.id) {
            return updatedUser.data;
          } else {
            return u;
          }
        })
      );
      setErrorMessage("");
      if (createMode) {
        setCreateMode(!createMode);
        handleEdit(updatedUser.data);
        setInfoMessage("User created successfully");
      } else {
        setInfoMessage("User updated successfully");
      }
    } else {
      setErrorMessage("Error updating user");
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    switch (e.target.name) {
      default:
        setUser({ ...user, [e.target.name]: e.target.value });
        break;
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
      adminPermission: false,
      token: "",
      username: "",
      password: "",
      email: "",
      permissionList,
    });
  };

  return (
    <>
      {admin && (
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
                        onChange={handleChange}
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
                        onChange={handleChange}
                        value={user.password}
                        type="password"
                        id="password"
                        name="password"
                        disabled={user.id === 2}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="email">Email</label>
                      <input
                        className={styles.input}
                        onChange={handleChange}
                        value={user.email}
                        type="text"
                        id="email"
                        name="email"
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
                                checked={user && user.adminPermission}
                                onChange={(e) => {
                                  setUser({ ...user, adminPermission: e.target.checked });
                                }}
                                disabled={user.id === 1 || user.id === 2}
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
                                    disabled={user.id === 1}
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
                                    disabled={user.id === 1 || user.id === 2}
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
                    <th scope="col">Email</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {userList.map((user) => {
                    return (
                      <tr key={user.id}>
                        <th scope="row">{user.id}</th>
                        <td>{user.username}</td>
                        <td>{user.email}</td>
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
