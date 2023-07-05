import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { getEM, withORM } from "utils/mikro";

import _ from "lodash";
import { EntityData } from "@mikro-orm/core";
import { User as User_db } from "server/database/models/user.model";
import bcrypt from "bcryptjs";
import { roundDateToSecond } from "../../../utils/formatting";

const handleUser: NextApiHandler<WrappedResponse<User[] | User>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    const { userId } = req.query;
    const isAdmin = req.session.user.id === 1 || req.session.user.adminPermission; // will evaluate true or false
    let intUserId = null;
    if (req.method === "GET") {
      try {
        if (userId) {
          intUserId = parseInt(userId as string);
        }
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
      const user: User = req.body;
      const upsert: User = await upsertUser(user);
      if (!isAdmin) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      if (!upsert) {
        return res.status(500).json({ status: "error", message: "Error in query" });
      } else {
        return res.status(200).json({
          status: "success",
          message: "user upserted",
          data: upsert,
        });
      }
    }
    if (req.method == "DELETE") {
      const { userId } = req.query;
      const intUserId = parseInt(userId as string);
      const deleted: boolean = await deleteUser(intUserId);
      if (!isAdmin) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }

      if (!deleted) {
        return res.status(500).json({ status: "error", message: "Error in query" });
      } else {
        return res.status(200).json({
          status: "success",
          message: "user deleted",
        });
      }
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: "error", message: "Error in query" });
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
  if (userId == null) {
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
 * Inserts or Updates a user into the database
 * @returns a copy of the user object that was upserted
 * @param user
 */
async function upsertUser(user: User): Promise<User> {
  const em = getEM();
  const userCopy: User = _.cloneDeep(user);
  const salt = await bcrypt.genSalt();

  const upsertRecord: EntityData<User_db> = {
    ...userCopy,
    updatedAt: new Date(userCopy.updatedAt),
    createdAt: new Date(userCopy.createdAt),
  };

  const updateDate = roundDateToSecond(new Date());
  upsertRecord.updatedAt = updateDate;

  if (userCopy.id) {
    let existingUser = await em.findOne(User_db, { id: userCopy.id });

    if (!existingUser) {
      return null;
    }

    if (userCopy.password !== existingUser.password) {
      upsertRecord.password = await bcrypt.hash(userCopy.password, salt);
    }

    existingUser = em.assign(existingUser, upsertRecord);
    await em.persistAndFlush(existingUser);
    return {
      ...userCopy,
      updatedAt: existingUser.updatedAt.toISOString(),
      createdAt: existingUser.createdAt.toISOString(),
    } as User;
  } else {
    upsertRecord.createdAt = updateDate;
    const createReference = em.create(User_db, upsertRecord);
    await em.persistAndFlush(createReference);
    return {
      ...userCopy,
      updatedAt: createReference.updatedAt.toISOString(),
      createdAt: createReference.createdAt.toISOString(),
    } as User;
  }
}

/**
 * Deletes a user from the Database
 * @param userId user ID to delete
 * @returns true if the user was deleted, false if the user was not found
 */
async function deleteUser(userId: number): Promise<boolean> {
  const em = getEM();
  const entity = await em.findOne(User_db, { id: userId });
  if (entity) {
    await em.removeAndFlush(entity);
    return true;
  } else {
    return false;
  }
}

export default withIronSessionApiRoute(withORM(handleUser), ironOptions);
