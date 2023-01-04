import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { ForeignKeyConstraintViolationException, Loaded, QueryOrder } from "@mikro-orm/core";
import { STM_Objective as STMObjective_db } from "server/database/models/stm_objective.model";
import { STM_Goal as STMGoal_db } from "server/database/models/stm_goal.model";
import { STM_Investigation as STMInvestigation_db } from "server/database/models/stm_investigation.model";
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";

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
export const handleSTM: NextApiHandler<
  WrappedResponse<
    STMObjective[] | STMObjective | STMGoal[] | STMGoal | STMInvestigation[] | STMInvestigation
  >
> = async (req, res): Promise<unknown> => {
  try {
    if (req.session?.user) {
      const { missionId, stmType, o, g, i } = req.query;

      //clean url params
      const queryParams: {
        missionId: number;
        stmType: string;
        o: string;
        g: string;
        i: string;
      } = {
        missionId: parseInt(Array.isArray(missionId) ? missionId[0] : missionId),
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
      };
      // retrieve a STM record. Mission and type are required query prams
      if (req.method === "GET") {
        //validation check for required mission id
        if (!queryParams.missionId || _.isNaN(queryParams.missionId)) {
          return res.status(500).json({ status: "error", message: "Invalid mission ID" });
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
        //todo - need to check a valid o, g, and i uuid were supplied
        try {
          let deletedUUID: string | null;
          if (queryParams.stmType === "o") {
            deletedUUID = await deleteSTM(queryParams.o, "Objective");
          } else if (queryParams.stmType === "g") {
            deletedUUID = await deleteSTM(queryParams.g, "Goal");
          } else if (queryParams.stmType === "i") {
            deletedUUID = await deleteSTM(queryParams.i, "Investigation");
          } else {
            return res.status(500).json({ status: "error", message: "Invalid type" });
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
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: "error", message: "Error in query" });
  }
};

/**
 * get objective(s) from the database.
 * @param missionId the mission id. required
 * @param objectiveUUID optional objective uuid to retrieve. No value will retrieve all objectives for the mission
 * @returns array of stm objectives. returns empty array if no records found
 */
async function getObjectives(missionId: number, objectiveUUID?: string): Promise<STMObjective[]> {
  await Mikro.getORM();
  const em = Mikro.getEM();

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

  await Mikro.closeORM();
  if (objectives) {
    //convert fks
    const objectivesConverted: STMObjective[] = objectives.map((objectives_db) => {
      const objective = { ...objectives_db, missionId: objectives_db.mission.id };
      delete objective.mission;
      delete objective.goals;
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
  await Mikro.getORM();
  const em = Mikro.getEM();

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

  await Mikro.closeORM();

  if (goals) {
    //convert fks
    const goalsConverted: STMGoal[] = goals.map((goal_db) => {
      const goal = { ...goal_db, objectiveUuid: goal_db.objective.uuid };
      delete goal.objective;
      delete goal.investigations;
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
  await Mikro.getORM();
  const em = Mikro.getEM();

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

  await Mikro.closeORM();
  if (invstgs) {
    //convert fks
    const invstgConverted: STMInvestigation[] = invstgs.map((invstgs_db) => {
      const invstg = { ...invstgs_db, goalUuid: invstgs_db.goal.uuid };
      delete invstg.goal;
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
  await Mikro.getORM();
  const em = Mikro.getEM();

  //add on additonal fields the db tracks
  const updateDate = new Date();
  const upsertRecord: STMObjective | STMGoal | STMInvestigation = {
    ...stmObject,
    updatedAt: updateDate,
  };
  //we're creating a new record
  if (!stmObject.uuid) {
    upsertRecord.uuid = uuidv4();
    upsertRecord.createdAt = updateDate;
  }

  //determine the db table and perform upsert
  // let convertedRecord: STMObjective_db_type | STMGoal_db_type | STMInvestigation_db_type
  if (stmType === "Objective") {
    const objective = upsertRecord as STMObjective;
    const convertedRecord = { ...objective, mission: objective.missionId }; //convert fks
    delete convertedRecord.missionId;

    const upsertReference: STMObjective_db = await em.upsert(STMObjective_db, convertedRecord);
    await em.persistAndFlush(upsertReference);
    await Mikro.closeORM();

    return { ...upsertReference, missionId: upsertReference.mission.id } as STMObjective;
  } else if (stmType === "Goal") {
    const goal = upsertRecord as STMGoal;
    const convertedGoal = { ...goal, objective: goal.objectiveUuid }; //convert fks
    delete convertedGoal.objectiveUuid;

    const upsertReference: STMGoal_db = await em.upsert(STMGoal_db, convertedGoal);
    await em.persistAndFlush(upsertReference);
    await Mikro.closeORM();

    return { ...upsertReference, objectiveUuid: upsertReference.objective.uuid } as STMGoal;
  } else {
    const invstg = upsertRecord as STMInvestigation;
    const convertedInvstg = { ...invstg, goal: invstg.goalUuid };
    delete convertedInvstg.goalUuid;

    const upsertReference: STMInvestigation_db = await em.upsert(
      STMInvestigation_db,
      convertedInvstg
    );
    await em.persistAndFlush(upsertReference);
    await Mikro.closeORM();

    return { ...upsertReference, goalUuid: upsertReference.goal.uuid } as STMInvestigation;
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

  await Mikro.getORM();
  const em = Mikro.getEM();

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

  await Mikro.closeORM();
  return returnVal;
}

export default withIronSessionApiRoute(Mikro.withORM(handleSTM), ironOptions);
