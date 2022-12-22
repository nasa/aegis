import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { STM_Objective } from "../../models/stm_objective.model";
import { STM_Goal } from "../../models/stm_goal.model";
import { STM_Investigation } from "../../models/stm_investigation.model";
import { v4 as uuidv4 } from "uuid";

export class STMSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    context.uuid_obj1 = em.create(STM_Objective, {
      mission: 1,
      uuid: uuidv4(),
      numbering: "1",
      name: "Understanding Planetary Processes",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_obj2 = em.create(STM_Objective, {
      mission: 1,
      uuid: uuidv4(),
      numbering: "2",
      name: "Understanding Character and Origin of Lunar Polar Volatiles",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal1 = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "a",
      name: "Formation of the Earth-Moon System",
      objective: context.uuid_obj1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal2 = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "b",
      name: "Differentiation: Magma Oceans, Crust, and Mantle",
      objective: context.uuid_obj1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal3 = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "f",
      name: "The Moon is a Natural Laboratory for Regolith Processes and Weathering on Anhydrous Bodies",
      objective: context.uuid_obj1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal4 = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "a",
      name: "Determine the Compositional state (elemental, isotopic, mineralogic) and compositional distribution (lateral and with depth) of the volatile component",
      objective: context.uuid_obj2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal5 = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "b",
      name: "Determine the source(s) for lunar polar volatile deposits",
      objective: context.uuid_obj2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Establish the mechanisms, timing, and extent of volatile depletion in the Moon",
      goal: context.uuid_goal1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "2",
      name: "Constrain the physicochemical conditions and processes that operated at the surface of the lunar magma ocean",
      goal: context.uuid_goal1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg3 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "3",
      name: "Understand the size, chemical makeup, and timing of core formation",
      goal: context.uuid_goal1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg4 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Determine the extent and composition of the primary feldspathic crust, KREEP layer, and other products of planetary differentiation",
      goal: context.uuid_goal2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg5 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "2",
      name: "Determine the bulk composition of the crust and mantle",
      goal: context.uuid_goal2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg6 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "3",
      name: "Inventory, relationships, and ages of nonmare rocks.",
      goal: context.uuid_goal2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg7 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Determine physical properties of regolith at diverse locations of expected human activity",
      goal: context.uuid_goal3,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg8 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Identification of surface frost composition",
      goal: context.uuid_goal4,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg9 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "2",
      name: "Identification of surface frost locations in spatial context",
      goal: context.uuid_goal4,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg10 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "3",
      name: "Temporal variability of frost",
      goal: context.uuid_goal4,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg11 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Origin of the polar volatiles",
      goal: context.uuid_goal5,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    context.uuid_obj100 = em.create(STM_Objective, {
      mission: 2,
      uuid: uuidv4(),
      numbering: "1",
      name: "Jackies Secret Mission Objective",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal100 = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "a",
      name: "Take over the world",
      objective: context.uuid_obj100,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg00 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Determine points of vulnerability",
      goal: context.uuid_goal100,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
