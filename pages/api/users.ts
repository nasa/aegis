import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { getEM, withORM } from "utils/mikro";

import _ from "lodash";
import { EntityData } from "@mikro-orm/core";
import { User_db } from "server/database/models/_allModels";
import bcrypt from "bcryptjs";

const handleUser: NextApiHandler<WrappedResponse<User[] | User>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    const { userId } = req.query;
    const intUserId = parseInt(userId as string);

    //only super admin can edit users
    if (!req.session.user.isSuperAdmin) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    if (req.method === "GET") {
      try {
        const users: User[] = await getUsers(intUserId);

        return res.status(200).json({
          status: "success",
          message: "user retrieved",
          data: users,
        });
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the GET request" });
      }
    }
    if (req.method == "POST") {
      const users: User[] = req.body as User[];
      const upsertedUsers: User[] = await upsertUsers(users);

      if (upsertedUsers.length === 0) {
        return res.status(500).json({ status: "error", message: "Error in query" });
      } else {
        return res.status(200).json({
          status: "success",
          message: "user upserted",
          data: upsertedUsers,
        });
      }
    }

    if (req.method == "DELETE") {
      const usersToDelete: number[] = req.body.map((u: string) => parseInt(u));
      const deletedUuids = await deleteUsers(usersToDelete);

      if (deletedUuids.length > 0) {
        return res.status(200).json({
          status: "success",
          message: "user deleted",
        });
      } else {
        return res.status(500).json({ status: "error", message: "Error in query" });
      }
    }
  } catch (e) {
    return res.status(500).json({ status: "error", message: "Error in query: " + e });
  }
};

/**
 * get user(s) from the database
 * @returns array of users
 * @param userId
 */
async function getUsers(userId: number = null): Promise<User[]> {
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
async function deleteUsers(userIds: number[]): Promise<number[]> {
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

export default withIronSessionApiRoute(withORM(handleUser), ironOptions);
