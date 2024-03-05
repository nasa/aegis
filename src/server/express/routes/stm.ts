import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import _ from "lodash";

import { hasPerms } from "utils/permissions";

import { getEM } from "utils/mikro";
import { v4 as uuidv4 } from "uuid";
import {
  EntityData,
  EntityName,
  ForeignKeyConstraintViolationException,
  Loaded,
  QueryOrder,
} from "@mikro-orm/core";
import {
  STM_Objective_db,
  STM_Goal_db,
  STM_Investigation_db,
} from "server/database/models/_allModels";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, stmType, o, g, i } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    stmType: stmType ? stmType.toString() : undefined,
    o: o ? o.toString() : undefined,
    g: g ? g.toString() : undefined,
    i: i ? i.toString() : undefined,
  };
  return queryObj;
};
type QueryParamDict = {
  o: string;
  g: string;
  i: string;
  a: string;
};

const queryParamDict = {
  o: "Objective",
  g: "Goal",
  i: "Investigation",
  a: "ALL",
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const viewPermission = await hasPerms(queryObj.missionId, "view", req.session.user);
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || _.isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  //required for all queries. validate.
  if (!queryObj.stmType) {
    res.status(500).json({ status: "error", message: "Invalid stm type" });
    return;
  }
  try {
    let records: STMObjective[] | STMGoal[] | STMInvestigation[] = [];

    if (queryObj.stmType === "o") {
      records = await getObjectives(queryObj.missionId, queryObj.o);
    } else if (queryObj.stmType === "g") {
      records = await getGoals(queryObj.missionId, queryObj.o, queryObj.g);
    } else if (queryObj.stmType === "i") {
      records = await getInvestigations(queryObj.missionId, queryObj.o, queryObj.g, queryObj.i);
    } else {
      res.status(500).json({ status: "error", message: "Invalid stm type" });
      return;
    }

    res.status(200).json({
      status: "success",
      message: `${queryParamDict[queryObj.stmType as keyof QueryParamDict]} retrieved`,
      data: records,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const editPermission = await hasPerms(queryObj.missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    let upsertResponse: STMObjective[] | STMGoal[] | STMInvestigation[] = [];
    let upsertObjects: STMObjective[] | STMGoal[] | STMInvestigation[];
    let upsertType: "Objective" | "Goal" | "Investigation";

    if (queryObj.stmType === "o") {
      upsertObjects = req.body as STMObjective[];
      upsertType = "Objective";
    } else if (queryObj.stmType === "g") {
      upsertObjects = req.body as STMGoal[];
      upsertType = "Goal";
    } else if (queryObj.stmType === "i") {
      upsertObjects = req.body as STMInvestigation[];
      upsertType = "Investigation";
    } else {
      res.status(500).json({ status: "error", message: "Invalid type" });
      return;
    }

    //perform the upsert
    upsertResponse = await upsertSTMs(upsertObjects, upsertType);

    //check response
    if (upsertResponse.length > 0) {
      res.status(200).json({
        status: "success",
        message: `${
          queryParamDict[queryObj.stmType as keyof QueryParamDict]
        } upserted with uuid ${upsertResponse.map((s) => s.uuid)}`,
        data: upsertResponse,
      });
    } else {
      res.status(500).json({
        status: "error",
        message: "Upsert response did not return a value",
        data: null,
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const editPermission = await hasPerms(queryObj.missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    let deletedResponse: string[];
    const uuidsToDelete: string[] = req.body;

    if (queryObj.stmType === "o") {
      deletedResponse = await deleteSTMs(uuidsToDelete, "Objective");
    } else if (queryObj.stmType === "g") {
      deletedResponse = await deleteSTMs(uuidsToDelete, "Goal");
    } else if (queryObj.stmType === "i") {
      deletedResponse = await deleteSTMs(uuidsToDelete, "Investigation");
    } else if (queryObj.stmType === "a" && queryObj.missionId) {
      deletedResponse = [await deleteSTMTree(queryObj.missionId)];
    } else {
      res.status(500).json({ status: "error", message: "Invalid url parameters" });
      return;
    }

    if (deletedResponse.length > 0) {
      res.status(200).json({
        status: "success",
        message: `${queryParamDict[queryObj.stmType as keyof QueryParamDict]} deleted`,
      });
    } else {
      res.status(404).json({
        status: "failure",
        message: `Record not found. Nothing deleted`,
      });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ForeignKeyConstraintViolationException) {
      res.status(500).json({
        status: "error",
        message: "Cannot delete mission. This mission is referenced elsewhere",
        data: null,
      });
    } else {
      res.status(500).json({
        status: "error",
        message: "Error processing the DELETE request",
        data: null,
      });
    }
  }
});

export default router;

/**
 * get objective(s) from the database.
 * @param missionId the mission id. required
 * @param objectiveUUID optional objective uuid to retrieve. No value will retrieve all objectives for the mission
 * @returns array of stm objectives. returns empty array if no records found
 */
export async function getObjectives(
  missionId: number,
  objectiveUUID?: string
): Promise<STMObjective[]> {
  const em = getEM();

  let objectives: Loaded<STM_Objective_db, never>[];
  if (objectiveUUID) {
    objectives = await em.find(
      STM_Objective_db,
      { uuid: objectiveUUID, mission: { id: missionId } },
      { orderBy: { numbering: QueryOrder.ASC } }
    );
  } else {
    objectives = await em.find(
      STM_Objective_db,
      { mission: { id: missionId } },
      { orderBy: { numbering: QueryOrder.ASC } }
    );
  }

  if (objectives) {
    //convert fks
    const objectivesConverted: STMObjective[] = objectives.map((objectives_db) => {
      const objective: STMObjective = {
        uuid: objectives_db.uuid,
        numbering: objectives_db.numbering,
        name: objectives_db.name,
        missionId: objectives_db.mission.id,
        createdAt: objectives_db.createdAt.toISOString(),
        updatedAt: objectives_db.updatedAt.toISOString(),
      };
      return objective;
    });
    return objectivesConverted;
  } else {
    return [];
  }
}

/**
 * get goal(s) from the database
 * @param missionId the mission id. required
 * @param objectiveUUID optional objective uuid. If specified, all goals under this objective are returned
 * @param goalUUID optional goal uuid to retrieve. No value will retrieve all goals for the mission/objective
 * @returns array of stm goals. returns empty array if no records found
 */
export async function getGoals(
  missionId: number,
  objectiveUUID?: string,
  goalUUID?: string
): Promise<STMGoal[]> {
  const em = getEM();

  //build the "where" options in Mikro ORM syntax
  const objectiveWhereClause: { uuid?: string; mission: { id: number } } = {
    mission: { id: missionId },
  };
  if (objectiveUUID) objectiveWhereClause.uuid = objectiveUUID;

  const goalWhereClause: { uuid?: string; objective: {} } = { objective: objectiveWhereClause };
  if (goalUUID) goalWhereClause.uuid = goalUUID;

  const goals: Loaded<STM_Goal_db, never>[] = await em.find(
    STM_Goal_db,
    { ...goalWhereClause },
    { orderBy: [{ objective: { numbering: QueryOrder.ASC } }, { numbering: QueryOrder.ASC }] }
  );

  if (goals) {
    //convert fks
    const goalsConverted: STMGoal[] = goals.map((goal_db) => {
      const goal: STMGoal = {
        uuid: goal_db.uuid,
        numbering: goal_db.numbering,
        name: goal_db.name,
        objectiveUuid: goal_db.objective.uuid,
        createdAt: goal_db.createdAt.toISOString(),
        updatedAt: goal_db.updatedAt.toISOString(),
      };
      return goal;
    });
    return goalsConverted;
  } else {
    return [];
  }
}

/**
 * get investigation(s) from the database
 * @param missionId the mission id. required
 * @param objectiveUUID optional objective uuid. If specified, all investigations under this objective are returned
 * @param goalUUID optional goal uuid. If specified, all investigations under this goal are returned
 * @param investigationUUID optional investigation uuid to retrieve. No value will retrieve all investigations for the mission/objective/goal
 * @returns array of stm investigations. returns empty array if no records found
 */
export async function getInvestigations(
  missionId: number,
  objectiveUUID?: string,
  goalUUID?: string,
  investigationUUID?: string
): Promise<STMInvestigation[]> {
  const em = getEM();

  //build the "where" options in Mikro ORM syntax
  const objectiveWhereClause: { uuid?: string; mission: { id: number } } = {
    mission: { id: missionId },
  };
  if (objectiveUUID) objectiveWhereClause.uuid = objectiveUUID;

  const goalWhereClause: { uuid?: string; objective: {} } = { objective: objectiveWhereClause };
  if (goalUUID) goalWhereClause.uuid = goalUUID;

  const invstgWhereClause: { uuid?: string; goal: {} } = { goal: goalWhereClause };
  if (investigationUUID) invstgWhereClause.uuid = investigationUUID;

  const invstgs: Loaded<STM_Investigation_db, never>[] = await em.find(
    STM_Investigation_db,
    { ...invstgWhereClause },
    {
      orderBy: [
        { goal: { objective: { numbering: QueryOrder.ASC } } },
        { goal: { numbering: QueryOrder.ASC } },
        { numbering: QueryOrder.ASC },
      ],
    }
  );

  if (invstgs) {
    //convert fks
    const invstgConverted: STMInvestigation[] = invstgs.map((invstgs_db) => {
      const invstg: STMInvestigation = {
        uuid: invstgs_db.uuid,
        numbering: invstgs_db.numbering,
        name: invstgs_db.name,
        goalUuid: invstgs_db.goal.uuid,
        createdAt: invstgs_db.createdAt.toISOString(),
        updatedAt: invstgs_db.updatedAt.toISOString(),
      };
      return invstg;
    });
    return invstgConverted;
  } else {
    return [];
  }
}

/**
 * Inserts or Updates either objectives, goals, or investigations into the database.
 * Takes the object and converts fks to upsert, then converts them back on return
 * @param stmObjects the STM objectives, goals, or investigations object to upsert
 * @param stmType a string representation of the record type. This is used to type check at runtime since these are custom typescript types
 * @returns a copy of the STM objects that were upserted
 */
export async function upsertSTMs(
  stmObjects: STMObjective[] | STMGoal[] | STMInvestigation[],
  stmType: "Objective" | "Goal" | "Investigation"
): Promise<STMObjective[] | STMGoal[] | STMInvestigation[]> {
  const em = getEM();

  //determine the db table and perform upsert
  if (stmType === "Objective") {
    const stmsUpsertedToDb: STMObjective[] = [];
    for (const stmObject of stmObjects) {
      const objective = stmObject as STMObjective;
      const convertedObjective: EntityData<STM_Objective_db> = {
        uuid: objective.uuid || uuidv4(),
        numbering: objective.numbering,
        name: objective.name,
        mission: objective.missionId,
        createdAt: new Date(objective.createdAt),
        updatedAt: new Date(objective.updatedAt),
      }; //convert fks

      const upsertReference: STM_Objective_db = await em.upsert(
        STM_Objective_db,
        convertedObjective
      );
      em.persist(upsertReference);

      const upsertedObjective: STMObjective = {
        uuid: upsertReference.uuid,
        numbering: upsertReference.numbering,
        name: upsertReference.name,
        missionId: upsertReference.mission.id,
        createdAt: upsertReference.createdAt.toISOString(),
        updatedAt: upsertReference.updatedAt.toISOString(),
      };
      stmsUpsertedToDb.push(upsertedObjective);
    }
    await em.flush();
    return stmsUpsertedToDb;
  } else if (stmType === "Goal") {
    const stmsUpsertedToDb: STMGoal[] = [];
    for (const stmObject of stmObjects) {
      const goal = stmObject as STMGoal;
      const convertedGoal: EntityData<STM_Goal_db> = {
        uuid: goal.uuid || uuidv4(),
        numbering: goal.numbering,
        name: goal.name,
        objective: goal.objectiveUuid,
        createdAt: new Date(goal.createdAt),
        updatedAt: new Date(goal.updatedAt),
      }; //convert fks

      const upsertReference: STM_Goal_db = await em.upsert(STM_Goal_db, convertedGoal);
      em.persist(upsertReference);

      const upsertedGoal: STMGoal = {
        uuid: upsertReference.uuid,
        numbering: upsertReference.numbering,
        name: upsertReference.name,
        objectiveUuid: upsertReference.objective.uuid,
        createdAt: upsertReference.createdAt.toISOString(),
        updatedAt: upsertReference.updatedAt.toISOString(),
      };
      stmsUpsertedToDb.push(upsertedGoal);
    }
    await em.flush();
    return stmsUpsertedToDb;
  } else {
    const stmsUpsertedToDb: STMInvestigation[] = [];
    for (const stmObject of stmObjects) {
      const invstg = stmObject as STMInvestigation;
      const convertedInvstg: EntityData<STM_Investigation_db> = {
        uuid: invstg.uuid || uuidv4(),
        numbering: invstg.numbering,
        name: invstg.name,
        goal: invstg.goalUuid,
        createdAt: new Date(invstg.createdAt),
        updatedAt: new Date(invstg.updatedAt),
      };
      const upsertReference: STM_Investigation_db = await em.upsert(
        STM_Investigation_db,
        convertedInvstg
      );
      em.persist(upsertReference);

      const upsertedInvstg: STMInvestigation = {
        uuid: upsertReference.uuid,
        numbering: upsertReference.numbering,
        name: upsertReference.name,
        goalUuid: upsertReference.goal.uuid,
        createdAt: upsertReference.createdAt.toISOString(),
        updatedAt: upsertReference.updatedAt.toISOString(),
      };
      stmsUpsertedToDb.push(upsertedInvstg);
    }
    await em.flush();
    return stmsUpsertedToDb;
  }
}

/**
 * Deletes objectives, goals, or investigations for given UUIDs
 * @param stmUUID UUIDs of the objective, goal, or investigation to delete
 * @param stmType the type of STM object
 * @return Retruns a promise of a string uuids of the entity deleted
 */
export async function deleteSTMs(
  stmUuids: string[],
  stmType: "Objective" | "Goal" | "Investigation"
): Promise<string[]> {
  const em = getEM();
  const deletedUuids = [];
  let tableEntity: EntityName<STM_Objective_db | STM_Goal_db | STM_Investigation_db>;

  if (stmType === "Objective") {
    tableEntity = STM_Objective_db;
  } else if (stmType === "Goal") {
    tableEntity = STM_Goal_db;
  } else {
    tableEntity = STM_Investigation_db;
  }
  for (const stmUuid of stmUuids) {
    const entity = await em.findOne(tableEntity, stmUuid);
    if (entity) {
      em.remove(entity);
      deletedUuids.push(stmUuid);
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}

/**
 * Deletes entire STM tree for a given mission
 */
export async function deleteSTMTree(missionId: number): Promise<string> {
  const em = getEM();

  // loop through hierarchy and delete. There's probably a better way to do this but I burned hours so this is it for now
  const objectives = await getObjectives(missionId);
  for (const objective of objectives) {
    const goals = await getGoals(missionId, objective.uuid);
    for (const goal of goals) {
      const investigations = await getInvestigations(missionId, null, goal.uuid);
      for (const investigation of investigations) {
        const entity = await em.findOne(STM_Investigation_db, investigation.uuid);
        em.remove(entity);
      }
      const entity = await em.findOne(STM_Goal_db, goal.uuid);
      em.remove(entity);
    }
    const entity = await em.findOne(STM_Objective_db, objective.uuid);
    em.remove(entity);
  }
  await em.flush();

  return "all items deleted";
}
