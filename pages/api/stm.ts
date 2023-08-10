import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { withORM, getEM } from "utils/mikro";
import {
  EntityData,
  ForeignKeyConstraintViolationException,
  Loaded,
  QueryOrder,
} from "@mikro-orm/core";
import { STM_Objective as STMObjective_db } from "server/database/models/stm_objective.model";
import { STM_Goal as STMGoal_db } from "server/database/models/stm_goal.model";
import { STM_Investigation as STMInvestigation_db } from "server/database/models/stm_investigation.model";
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";
import { hasPerms } from "utils/permissions";

/**
 * /api/stm?missionId=&stmType=
 *
 * Get stm object(s) for a given mission.
 *
 * The request method will determine what action to perform
 *    GET = get all, subset, or single record
 *      Required URL parameters are:
 *        missionId=  mission ID number
 *        stmType=o|g|i  type of object returned. Either objective, goal, or investigation
 *      Optional URL parameters to futher refine results:
 *        o=uuid      objective UUID
 *        g=uuid      goal UUID
 *        i=uuid      investigation UUID
 *    POST = upsert a STM (defined in POST body) into the DB
 *      A full STM object (with an uuid for new stm) should be specified in the request body
 *      Required URL parameters are:
 *        stmType=o|g|i  type of object to upsert. Either objective, goal, or investigation
 *    DELETE = delete the STM for a given stmUUID and type
 *      Required URL parameters are:
 *        stmType=o|g|i  type of object to delete. Either objective, goal, or investigation
 *        o=uuid      objective UUID
 *        g=uuid      goal UUID
 *        i=uuid      investigation UUID
 */
const handleSTM: NextApiHandler<
  WrappedResponse<
    STMObjective[] | STMObjective | STMGoal[] | STMGoal | STMInvestigation[] | STMInvestigation
  >
> = async (req, res): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    const missionId = req.query.missionId ? req.query.missionId : req.body.missionId;
    const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
    //check for required mission id is valid
    if (!intMissionId || _.isNaN(intMissionId)) {
      return res.status(500).json({ status: "error", message: "Invalid mission ID" });
    }
    const editPermission = await hasPerms(intMissionId, "edit", req.session?.user);

    const { stmType, o, g, i } = req.query;

    //clean url params
    const queryParams: {
      missionId: number;
      stmType: string;
      o: string;
      g: string;
      i: string;
    } = {
      missionId: intMissionId,
      stmType: Array.isArray(stmType) ? stmType[0] : stmType,
      o: Array.isArray(o) ? o[0] : o,
      g: Array.isArray(g) ? g[0] : g,
      i: Array.isArray(i) ? i[0] : i,
    };

    //required for all queries. validate.
    if (!queryParams.stmType) {
      return res.status(500).json({ status: "error", message: "Invalid stm type" });
    }

    const urlParamDict = {
      o: "Objective",
      g: "Goal",
      i: "Investigation",
      a: "ALL",
    };
    // retrieve a STM record. Mission and type are required query prams
    if (req.method === "GET") {
      const viewPermission = await hasPerms(intMissionId, "view", req.session.user);
      if (!viewPermission && !editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }

      try {
        let records: STMObjective[] | STMGoal[] | STMInvestigation[] = [];

        if (queryParams.stmType === "o") {
          records = await getObjectives(queryParams.missionId, queryParams.o);
        } else if (queryParams.stmType === "g") {
          records = await getGoals(queryParams.missionId, queryParams.o, queryParams.g);
        } else if (queryParams.stmType === "i") {
          records = await getInvestigations(
            queryParams.missionId,
            queryParams.o,
            queryParams.g,
            queryParams.i
          );
        } else {
          return res.status(500).json({ status: "error", message: "Invalid stm type" });
        }

        return res.status(200).json({
          status: "success",
          message: `${urlParamDict[queryParams.stmType]} retrieved`,
          data: records,
        });
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the GET request" });
      }
    }

    //upsert a STM record
    if (req.method === "POST") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      try {
        let upsertResponse: STMObjective | STMGoal | STMInvestigation = null;
        let upsertObject: STMObjective | STMGoal | STMInvestigation;
        let upsertType: "Objective" | "Goal" | "Investigation";

        if (queryParams.stmType === "o") {
          upsertObject = req.body as STMObjective;
          upsertType = "Objective";
        } else if (queryParams.stmType === "g") {
          upsertObject = req.body as STMGoal;
          upsertType = "Goal";
        } else if (queryParams.stmType === "i") {
          upsertObject = req.body as STMInvestigation;
          upsertType = "Investigation";
        } else {
          return res.status(500).json({ status: "error", message: "Invalid type" });
        }

        //perform the upsert
        upsertResponse = await upsertSTM(upsertObject, upsertType);

        //check response
        if (upsertResponse) {
          return res.status(200).json({
            status: "success",
            message: `${urlParamDict[queryParams.stmType]} upserted with uuid ${
              upsertResponse.uuid
            }`,
            data: upsertResponse,
          });
        } else {
          return res.status(500).json({
            status: "error",
            message: "Upsert response did not return a value",
            data: null,
          });
        }
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the POST request" });
      }
    }

    //delete a STM record
    if (req.method === "DELETE") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      try {
        let deletedUUID: string | null;
        if (queryParams.stmType === "o" && queryParams.o) {
          deletedUUID = await deleteSTM(queryParams.o, "Objective");
        } else if (queryParams.stmType === "g" && queryParams.g) {
          deletedUUID = await deleteSTM(queryParams.g, "Goal");
        } else if (queryParams.stmType === "i" && queryParams.i) {
          deletedUUID = await deleteSTM(queryParams.i, "Investigation");
        } else if (queryParams.stmType === "a" && queryParams.missionId) {
          deletedUUID = await deleteSTMTree(queryParams.missionId);
        } else {
          return res.status(500).json({ status: "error", message: "Invalid url parameters" });
        }

        if (deletedUUID) {
          return res.status(200).json({
            status: "success",
            message: `${urlParamDict[queryParams.stmType]} deleted`,
          });
        } else {
          return res.status(404).json({
            status: "failure",
            message: `Record not found. Nothing deleted`,
          });
        }
      } catch (e) {
        console.error(e);
        if (e instanceof ForeignKeyConstraintViolationException) {
          return res.status(500).json({
            status: "error",
            message: "Cannot delete mission. This mission is referenced elsewhere",
            data: null,
          });
        } else {
          return res.status(500).json({
            status: "error",
            message: "Error processing the DELETE request",
            data: null,
          });
        }
      }
    }
  } catch (e) {
    return res.status(500).json({ status: "error", message: "Error in query: " + e });
  }
};

/**
 * get objective(s) from the database.
 * @param missionId the mission id. required
 * @param objectiveUUID optional objective uuid to retrieve. No value will retrieve all objectives for the mission
 * @returns array of stm objectives. returns empty array if no records found
 */
async function getObjectives(missionId: number, objectiveUUID?: string): Promise<STMObjective[]> {
  const em = getEM();

  let objectives: Loaded<STMObjective_db, never>[];
  if (objectiveUUID) {
    objectives = await em.find(
      STMObjective_db,
      { uuid: objectiveUUID, mission: { id: missionId } },
      { orderBy: { numbering: QueryOrder.ASC } }
    );
  } else {
    objectives = await em.find(
      STMObjective_db,
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
async function getGoals(
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

  const goals: Loaded<STMGoal_db, never>[] = await em.find(
    STMGoal_db,
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
async function getInvestigations(
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

  const invstgs: Loaded<STMInvestigation_db, never>[] = await em.find(
    STMInvestigation_db,
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
 * Inserts or Updates either an objective, goal, or investigation into the database.
 * Takes the object and converts fks to upsert, then converts them back on return
 * @param stmObject the STM objective, goal, or investigation object to upsert
 * @param stmType a string representation of the record type. This is used to type check at runtime since these are custom typescript types
 * @returns a copy of the STM object that was upserted
 */
async function upsertSTM(
  stmObject: STMObjective | STMGoal | STMInvestigation,
  stmType: "Objective" | "Goal" | "Investigation"
): Promise<STMObjective | STMGoal | STMInvestigation> {
  const em = getEM();

  //we're creating a new record
  if (!stmObject.uuid) {
    stmObject.uuid = uuidv4();
  }

  //determine the db table and perform upsert
  if (stmType === "Objective") {
    const objective = stmObject as STMObjective;
    const convertedObjective: EntityData<STMObjective_db> = {
      uuid: objective.uuid,
      numbering: objective.numbering,
      name: objective.name,
      mission: objective.missionId,
      createdAt: new Date(objective.createdAt),
      updatedAt: new Date(objective.updatedAt),
    }; //convert fks

    const upsertReference: STMObjective_db = await em.upsert(STMObjective_db, convertedObjective);
    await em.persistAndFlush(upsertReference);

    const upsertedObjective: STMObjective = {
      uuid: upsertReference.uuid,
      numbering: upsertReference.numbering,
      name: upsertReference.name,
      missionId: upsertReference.mission.id,
      createdAt: upsertReference.createdAt.toISOString(),
      updatedAt: upsertReference.updatedAt.toISOString(),
    };
    return upsertedObjective;
  } else if (stmType === "Goal") {
    const goal = stmObject as STMGoal;
    const convertedGoal: EntityData<STMGoal_db> = {
      uuid: goal.uuid,
      numbering: goal.numbering,
      name: goal.name,
      objective: goal.objectiveUuid,
      createdAt: new Date(goal.createdAt),
      updatedAt: new Date(goal.updatedAt),
    }; //convert fks

    const upsertReference: STMGoal_db = await em.upsert(STMGoal_db, convertedGoal);
    await em.persistAndFlush(upsertReference);

    const upsertedGoal: STMGoal = {
      uuid: upsertReference.uuid,
      numbering: upsertReference.numbering,
      name: upsertReference.name,
      objectiveUuid: upsertReference.objective.uuid,
      createdAt: upsertReference.createdAt.toISOString(),
      updatedAt: upsertReference.updatedAt.toISOString(),
    };
    return upsertedGoal;
  } else {
    const invstg = stmObject as STMInvestigation;
    const convertedInvstg: EntityData<STMInvestigation_db> = {
      uuid: invstg.uuid,
      numbering: invstg.numbering,
      name: invstg.name,
      goal: invstg.goalUuid,
      createdAt: new Date(invstg.createdAt),
      updatedAt: new Date(invstg.updatedAt),
    };
    const upsertReference: STMInvestigation_db = await em.upsert(
      STMInvestigation_db,
      convertedInvstg
    );
    await em.persistAndFlush(upsertReference);

    const upsertedInvstg: STMInvestigation = {
      uuid: upsertReference.uuid,
      numbering: upsertReference.numbering,
      name: upsertReference.name,
      goalUuid: upsertReference.goal.uuid,
      createdAt: upsertReference.createdAt.toISOString(),
      updatedAt: upsertReference.updatedAt.toISOString(),
    };
    return upsertedInvstg;
  }
}

/**
 * Deletes a single objective, goal, or investigation for a given UUID
 * @param stmUUID UUID of the objective, goal, or investigation to delete
 * @param stmType the type of STM object
 * @return Retruns a promise of a string uuid of the entity deleted, or null if nothing was deleted
 */
async function deleteSTM(
  stmUUID: string,
  stmType: "Objective" | "Goal" | "Investigation"
): Promise<string | null> {
  let returnVal = stmUUID;

  const em = getEM();

  if (stmType === "Objective") {
    const entity = await em.findOne(STMObjective_db, stmUUID);
    if (entity) {
      await em.removeAndFlush(entity);
    } else {
      returnVal = null;
    }
  } else if (stmType === "Goal") {
    const entity = await em.findOne(STMGoal_db, stmUUID);
    if (entity) {
      await em.removeAndFlush(entity);
    } else {
      returnVal = null;
    }
  } else {
    const entity = await em.findOne(STMInvestigation_db, stmUUID);
    if (entity) {
      await em.removeAndFlush(entity);
    } else {
      returnVal = null;
    }
  }

  return returnVal;
}

/**
 * Deletes entire STM tree for a given mission
 */
async function deleteSTMTree(missionId: number): Promise<string> {
  const em = getEM();

  // loop through hierarchy and delete. There's probably a better way to do this but I burned hours so this is it for now
  const objectives = await getObjectives(missionId);
  for (const objective of objectives) {
    const goals = await getGoals(missionId, objective.uuid);
    for (const goal of goals) {
      const investigations = await getInvestigations(missionId, null, goal.uuid);
      for (const investigation of investigations) {
        const entity = await em.findOne(STMInvestigation_db, investigation.uuid);
        em.remove(entity);
      }
      const entity = await em.findOne(STMGoal_db, goal.uuid);
      em.remove(entity);
    }
    const entity = await em.findOne(STMObjective_db, objective.uuid);
    em.remove(entity);
  }
  await em.flush();

  return "all items deleted";
}

export default withIronSessionApiRoute(withORM(handleSTM), ironOptions);
