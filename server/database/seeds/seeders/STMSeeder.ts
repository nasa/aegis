import { Seeder } from "@mikro-orm/seeder";
import { EntityManager } from "@mikro-orm/core";
import { STMObjective } from "../../models/stmObjective.model";
import { STMGoal } from "../../models/stmGoal.model";
import { STMInvestigation } from "../../models/stmInvestigation.model";

export class STMSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    em.create(STMObjective, {
      mission: 1,
      uuid: "uuid-obj1",
      numbering: "1",
      name: "Understanding Planetary Processes",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMObjective, {
      mission: 1,
      uuid: "uuid-obj2",
      numbering: "2",
      name: "Understanding Character and Origin of Lunar Polar Volatiles",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMGoal, {
      uuid: "uuid-goal1",
      numbering: "a",
      name: "Formation of the Earth-Moon System",
      objective: "uuid-obj1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMGoal, {
      uuid: "uuid-goal2",
      numbering: "b",
      name: "Differentiation: Magma Oceans, Crust, and Mantle",
      objective: "uuid-obj1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMGoal, {
      uuid: "uuid-goal3",
      numbering: "f",
      name: "The Moon is a Natural Laboratory for Regolith Processes and Weathering on Anhydrous Bodies",
      objective: "uuid-obj1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMGoal, {
      uuid: "uuid-goal4",
      numbering: "a",
      name: "Determine the Compositional state (elemental, isotopic, mineralogic) and compositional distribution (lateral and with depth) of the volatile component",
      objective: "uuid-obj2",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMGoal, {
      uuid: "uuid-goal5",
      numbering: "b",
      name: "Determine the source(s) for lunar polar volatile deposits",
      objective: "uuid-obj2",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMInvestigation, {
      uuid: "uuid-invstg1",
      numbering: "1",
      name: "Establish the mechanisms, timing, and extent of volatile depletion in the Moon",
      goal: "uuid-goal1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMInvestigation, {
      uuid: "uuid-invstg2",
      numbering: "2",
      name: "Constrain the physicochemical conditions and processes that operated at the surface of the lunar magma ocean",
      goal: "uuid-goal1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMInvestigation, {
      uuid: "uuid-invstg3",
      numbering: "3",
      name: "Understand the size, chemical makeup, and timing of core formation",
      goal: "uuid-goal1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMInvestigation, {
      uuid: "uuid-invstg4",
      numbering: "1",
      name: "Determine the extent and composition of the primary feldspathic crust, KREEP layer, and other products of planetary differentiation",
      goal: "uuid-goal2",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMInvestigation, {
      uuid: "uuid-invstg5",
      numbering: "2",
      name: "Determine the bulk composition of the crust and mantle",
      goal: "uuid-goal2",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMInvestigation, {
      uuid: "uuid-invstg6",
      numbering: "3",
      name: "Inventory, relationships, and ages of nonmare rocks.",
      goal: "uuid-goal2",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMInvestigation, {
      uuid: "uuid-invstg7",
      numbering: "1",
      name: "Determine physical properties of regolith at diverse locations of expected human activity",
      goal: "uuid-goal3",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMInvestigation, {
      uuid: "uuid-invstg8",
      numbering: "1",
      name: "Identification of surface frost composition",
      goal: "uuid-goal4",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMInvestigation, {
      uuid: "uuid-invstg9",
      numbering: "2",
      name: "Identification of surface frost locations in spatial context",
      goal: "uuid-goal4",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMInvestigation, {
      uuid: "uuid-invstg10",
      numbering: "3",
      name: "Temporal variability of frost",
      goal: "uuid-goal4",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMInvestigation, {
      uuid: "uuid-invstg11",
      numbering: "1",
      name: "Origin of the polar volatiles",
      goal: "uuid-goal5",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    em.create(STMObjective, {
      mission: 2,
      uuid: "uuid-obj100",
      numbering: "1",
      name: "Jackies Secret Mission Objective",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMGoal, {
      uuid: "uuid-goal100",
      numbering: "a",
      name: "Take over the world",
      objective: "uuid-obj100",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(STMInvestigation, {
      uuid: "uuid-invstg100",
      numbering: "1",
      name: "Determine points of vulnerability",
      goal: "uuid-goal100",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
