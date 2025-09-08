import type { EntityData } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import bcrypt from "bcryptjs";
import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { App_User_db } from "server/database/models/_allModels";
import { convertUsersTypeDbToStore, convertUsersTypeStoreToDb } from "store/storeUtils/user";
import { getEM } from "utils/mikro";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { userId } = query;
  const queryObj = {
    userId: userId ? parseInt(userId as string) : undefined,
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);

  //only super admin can view/edit users
  if (!req.session.appUser?.isSuperAdmin) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const users: AppUser[] = await getUsers(queryObj.userId);

    res.status(200).json({
      status: "success",
      message: "user retrieved",
      data: users,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { users } = req.body as UserUpsertRequest;
  //only super admin can view/edit users
  if (!req.session.appUser?.isSuperAdmin) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const upsertedUsers: AppUser[] = await upsertUsers(users);
    if (upsertedUsers.length === 0) {
      res.status(500).json({ status: "error", message: "Error in query" });
      return;
    }

    res.status(200).json({
      status: "success",
      message: "user upserted",
      data: upsertedUsers,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { userIds } = req.body as UserDeleteRequest;
  //only super admin can view/edit users
  if (!req.session.appUser?.isSuperAdmin) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deletedUuids = await deleteUsers(userIds);

    if (deletedUuids.length > 0) {
      res.status(200).json({
        status: "success",
        message: "user deleted",
      });
    } else {
      res.status(500).json({ status: "error", message: "Error in query" });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the DELETE request ${e}` });
  }
});

export default router;

/**
 * get user(s) from the database
 * @returns array of users
 * @param userId
 */
export async function getUsers(userId: number = null): Promise<AppUser[]> {
  const model = getEM();
  let users: App_User_db[];
  if (!userId) {
    users = await model.find(App_User_db, {});
  } else {
    users = await model.find(App_User_db, { id: userId });
  }

  return convertUsersTypeDbToStore(users);
}

/**
 * Inserts or Updates users into the database
 * @returns a copy of the user objects that were upserted
 * @param users
 */
export async function upsertUsers(users: AppUser[]): Promise<AppUser[]> {
  const em = getEM();
  const usersToUpsert: AppUser[] = cloneDeep(users);
  const usersUpsertedToDb = [];

  for (const userToUpsert of usersToUpsert) {
    const convertedUser: EntityData<App_User_db> = convertUsersTypeStoreToDb([userToUpsert])[0];

    if (convertedUser.id) {
      //upserting
      const userInDb = await em.findOne(App_User_db, { id: convertedUser.id });
      if (!userInDb) {
        return [];
      }
      //encrypt new password
      if (convertedUser.password !== userInDb.password) {
        const salt = await bcrypt.genSalt();
        convertedUser.password = await bcrypt.hash(convertedUser.password, salt);
      }
      const updatedUser = em.assign(userInDb, convertedUser);
      em.persist(updatedUser);
      usersUpsertedToDb.push(updatedUser);
    } else {
      // Creating. passwords are salted in the @beforeCreate() in the user model
      // Can't use "upsert" to insert a new record if there's no other unique column in the table
      delete convertedUser.id; // Attempting to insert with an id of null will throw a mikro error. remove the property completely so mikro can give us a new id.
      const createReference = em.create(App_User_db, convertedUser);
      em.persist(createReference);
      usersUpsertedToDb.push(createReference);
    }

    await em.flush();
    return convertUsersTypeDbToStore(usersUpsertedToDb);
  }
}

/**
 * Deletes users from the Database
 * @param userIds user IDs to delete
 * @returns the uuids of the deleted users
 */
export async function deleteUsers(userIds: number[]): Promise<number[]> {
  const em = getEM();
  const deletedUuids = [];
  for (const userId of userIds) {
    const entity = await em.findOne(App_User_db, { id: userId });
    if (entity) {
      em.remove(entity);
      deletedUuids.push(userId);
    }
  }
  await em.flush(); //perform deletes

  return deletedUuids;
}
