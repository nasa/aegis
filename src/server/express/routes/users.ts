import express, { Request, Response } from "express";

import _ from "lodash";

import { Query } from "express-serve-static-core";
import { getEM } from "utils/mikro";
import { EntityData } from "@mikro-orm/core";
import { User_db } from "server/database/models/_allModels";
import bcrypt from "bcryptjs";

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
  if (!req.session.user?.isSuperAdmin) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const users: User[] = await getUsers(queryObj.userId);

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
  //only super admin can view/edit users
  if (!req.session.user?.isSuperAdmin) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const users: User[] = req.body as User[];
    const upsertedUsers: User[] = await upsertUsers(users);
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
  //only super admin can view/edit users
  if (!req.session.user?.isSuperAdmin) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const usersToDelete: number[] = req.body.map((u: string) => parseInt(u));
    const deletedUuids = await deleteUsers(usersToDelete);

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
export async function getUsers(userId: number = null): Promise<User[]> {
  const model = getEM();
  let users: User_db[];
  if (!userId) {
    users = await model.find(User_db, {});
  } else {
    users = await model.find(User_db, { id: userId });
  }

  return users.map((user: User_db) => {
    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    } as User;
  });
}

/**
 * Inserts or Updates users into the database
 * @returns a copy of the user objects that were upserted
 * @param users
 */
export async function upsertUsers(users: User[]): Promise<User[]> {
  const em = getEM();
  const usersToUpsert: User[] = _.cloneDeep(users);
  const usersUpsertedToDb = [];

  for (const userToUpsert of usersToUpsert) {
    const convertedUser: EntityData<User_db> = {
      ...userToUpsert,
      updatedAt: new Date(userToUpsert.updatedAt),
      createdAt: new Date(userToUpsert.createdAt),
    };

    if (convertedUser.id) {
      //upserting
      const userInDb = await em.findOne(User_db, { id: convertedUser.id });
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
      //creating. passwords are salted in the @beforeCreate() in the user model
      const createReference = em.create(User_db, convertedUser);
      em.persist(createReference);
      usersUpsertedToDb.push(createReference);
    }

    await em.flush();
    const convertedUsers = usersUpsertedToDb.map((u) => {
      return {
        ...u,
        updatedAt: u.updatedAt.toISOString(),
        createdAt: u.createdAt.toISOString(),
      };
    });
    return convertedUsers;
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
    const entity = await em.findOne(User_db, { id: userId });
    if (entity) {
      em.remove(entity);
      deletedUuids.push(userId);
    }
  }
  await em.flush(); //perform deletes

  return deletedUuids;
}
