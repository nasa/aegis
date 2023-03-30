import { NextPage } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isAdmin, isLoggedIn } from "http-client/internal-api";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";
import { deleteUser, getUsers, upsertUser } from "../../http-client/user";
import { faEdit, faTrashCan, faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
const User: NextPage = () => {
  const router = useRouter();
  const [userList, setUserList] = useState<User[]>([]);
  const [user, setUser] = useState<User>();
  const [editMode, setEditMode] = useState<boolean>(false);
  const [infoMessage, setInfoMessage] = useState<string>("");
  const [createMode, setCreateMode] = useState<boolean>(false);
  const [admin, setAdmin] = useState<boolean>(false);

  //on load check login and mission id
  useEffect(() => {
    (async () => {
      const response = await isLoggedIn(); //check user is logged in
      const adminResponse = await isAdmin(); //check user is admin
      if (response.status !== "success" || !adminResponse.data["admin"]) {
        await router.push("/"); //user is not logged in or an admin. Redirect to homepage
      } else {
        setAdmin(true);
      }

      // Get a list of users from the database
      const users = (await getUsers()).data;
      setUserList(users);
    })();
  }, [router]);

  const handleEdit = (user) => {
    setUser(user);
    setEditMode(!editMode);
  };

  const handleDelete = async (user) => {
    const deletedUser = await deleteUser(user.id);
    if (deletedUser) {
      setUserList(userList.filter((u) => u.id !== user.id));
    } else {
      alert("There was an error deleting user");
    }
  };

  const handleBack = () => {
    setEditMode(false);
    setCreateMode(false);
    getUsers().then((users) => {
      setUserList(users.data);
    });
  };

  const handleSubmit = async () => {
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
      if (createMode) {
        setInfoMessage("User created successfully");
      } else {
        setInfoMessage("User updated successfully");
      }
    } else {
      setInfoMessage("Error updating user");
    }
  };

  const handleChange = (e) => {
    setUser({ ...user, [e.target.name]: e.target.value });
  };

  const handleCreate = (user) => {
    setUser(user);
    setCreateMode(!createMode);
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
                    handleCreate({
                      username: "",
                      email: "",
                      password: "",
                      permission: "admin",
                    });
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
                        defaultValue={"*********"}
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
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="permission">Permission</label>
                      <select
                        className={styles.input}
                        onChange={handleChange}
                        name="permission"
                        id="permission"
                        defaultValue="admin"
                      >
                        <option value="admin">Admin</option>
                        <option value="guest">Guest</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <button type="button" onClick={handleSubmit}>
                        Submit
                      </button>
                    </div>
                    {infoMessage && infoMessage == "Error updating user" && (
                      <p className={styles.errorMessage}>{infoMessage}</p>
                    )}
                    {infoMessage && infoMessage == "User created successfully" && (
                      <p className={styles.successMessage}>{infoMessage}</p>
                    )}
                    {infoMessage && infoMessage == "User updated successfully" && (
                      <p className={styles.successMessage}>{infoMessage}</p>
                    )}
                  </form>
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
                          <FontAwesomeIcon
                            icon={faTrashCan}
                            onClick={() => {
                              handleDelete(user);
                            }}
                          />
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
