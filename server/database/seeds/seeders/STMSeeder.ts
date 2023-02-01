import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { STM_Objective } from "../../models/stm_objective.model";
import { STM_Goal } from "../../models/stm_goal.model";
import { STM_Investigation } from "../../models/stm_investigation.model";
import { v4 as uuidv4 } from "uuid";

export class STMSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    context.uuid_obj1 = em.create(STM_Objective, {
      mission: context.mission1.id,
      uuid: uuidv4(),
      numbering: "1",
      name: "Understanding Planetary Processes",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_obj2 = em.create(STM_Objective, {
      mission: context.mission1.id,
      uuid: uuidv4(),
      numbering: "2",
      name: "Understanding Character and Origin of Lunar Polar Volatiles",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_obj3 = em.create(STM_Objective, {
      mission: context.mission1.id,
      uuid: uuidv4(),
      numbering: "3",
      name: "Interpreting the Impact History of the Earth-Moon System",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_obj5 = em.create(STM_Objective, {
      mission: context.mission1.id,
      uuid: uuidv4(),
      numbering: "5",
      name: "Observing the Universe and Local Space Environment from a Unique Location",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_obj7 = em.create(STM_Objective, {
      mission: context.mission1.id,
      uuid: uuidv4(),
      numbering: "7",
      name: "Investigating and Mitigating Exploration Risks",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    context.uuid_goal1a = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "a",
      name: "Formation of the Earth-Moon System",
      objective: context.uuid_obj1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal1b = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "b",
      name: "Differentiation: Magma Oceans, Crust, and Mantle",
      objective: context.uuid_obj1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal1f = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "f",
      name: "The Moon is a Natural Laboratory for Regolith Processes and Weathering on Anhydrous Bodies",
      objective: context.uuid_obj1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal2a = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "a",
      name: "Determine the Compositional state (elemental, isotopic, mineralogic) and compositional distribution (lateral and with depth) of the volatile component",
      objective: context.uuid_obj2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal2b = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "b",
      name: "Determine the source(s) for lunar polar volatile deposits",
      objective: context.uuid_obj2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal2c = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "c",
      name: "Understand the transport, retention, alteration, and loss processes that operate on volatile materials at permanently shaded lunar regions",
      objective: context.uuid_obj2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal2d = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "d",
      name: "Understand regolith modification processes (including space weathering), particularly deposition of volatile materials in the near surface",
      objective: context.uuid_obj2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal2f = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "f",
      name: "Understand the impact of human exploration on the lunar volatile record across the surface",
      objective: context.uuid_obj2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal3a = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "a",
      name: "Test the Cataclysm",
      objective: context.uuid_obj3,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal3b = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "b",
      name: "Understand changes to the Earth-Moon bombardment rate",
      objective: context.uuid_obj3,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal3c = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "c",
      name: "Understand the impact history of the landing site",
      objective: context.uuid_obj3,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal5b = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "b",
      name: "Heliophysical Investigations using the Moon",
      objective: context.uuid_obj5,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal7k = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "k",
      name: "Understand lunar dust behavior, particularly dust dynamics",
      objective: context.uuid_obj7,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal7l = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "l",
      name: "Understand lunar electrodynamics",
      objective: context.uuid_obj7,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_goal7m = em.create(STM_Goal, {
      uuid: uuidv4(),
      numbering: "m",
      name: "Monitor real-time environmental variables affecting safe operations, which includes monitoring for meteors, micrometeors, and other space debris that could potentially impact the lunar surface",
      objective: context.uuid_obj7,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    context.uuid_invstg1a1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Establish the mechanisms, timing, and extent of volatile depletion in the Moon",
      goal: context.uuid_goal1a,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg1a2 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "2",
      name: "Constrain the physicochemical conditions and processes that operated at the surface of the lunar magma ocean",
      goal: context.uuid_goal1a,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg1a3 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "3",
      name: "Understand the size, chemical makeup, and timing of core formation",
      goal: context.uuid_goal1a,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg1b1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Determine the extent and composition of the primary feldspathic crust, KREEP layer, and other products of planetary differentiation",
      goal: context.uuid_goal1b,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg1b2 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "2",
      name: "Determine the bulk composition of the crust and mantle",
      goal: context.uuid_goal1b,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg1b3 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "3",
      name: "Inventory, relationships, and ages of nonmare rocks.",
      goal: context.uuid_goal1b,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg1f1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Determine physical properties of regolith at diverse locations of expected human activity",
      goal: context.uuid_goal1f,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2a1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Identification of surface frost composition",
      goal: context.uuid_goal2a,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2a2 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "2",
      name: "Identification of surface frost locations in spatial context",
      goal: context.uuid_goal2a,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2a3 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "3",
      name: "Temporal variability of frost",
      goal: context.uuid_goal2a,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2a4 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "4",
      name: "Speciation of surface hydrogen",
      goal: context.uuid_goal2a,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2a5 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "5",
      name: "Understand surface hydrogen speciation spatial variability",
      goal: context.uuid_goal2a,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2a6 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "6",
      name: "Spatial distribution of subsurface hydrogen",
      goal: context.uuid_goal2a,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2a7 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "7",
      name: "Determine distribution of micro cold traps across lunar surface within illuminated regions",
      goal: context.uuid_goal2a,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2b1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Origin of the polar volatiles",
      goal: context.uuid_goal2b,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2c1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Distribution of water/OH within a PSR",
      goal: context.uuid_goal2c,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2c2 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "2",
      name: "Subsurface temperatures",
      goal: context.uuid_goal2c,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2c3 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "3",
      name: "Determine the compositional/physical properties of H-bearing species of the regolith as a function of time",
      goal: context.uuid_goal2c,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2d1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Speciation of surface hydrogen",
      goal: context.uuid_goal2d,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg2f1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Identify exploration-induced variations on volatile composition, form, and distribution on the lunar surface during sample collection and transport, during curation and analysis, and from landed activities",
      goal: context.uuid_goal2f,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg3a1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Identify impact melt, impact ejecta, and exogenous (impactor) material in lunar samples to address the hypothesized Lunar Cataclysm",
      goal: context.uuid_goal3a,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg3b1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Refine the post-basin impact flux, including up to the present",
      goal: context.uuid_goal3b,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg3c1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Determine the sequence of individual craters and basins that influence local, regional, and global stratigraphy at the Artemis III landing site",
      goal: context.uuid_goal3c,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg5b1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Near-Lunar Electromagnetic and Plasma Environment",
      goal: context.uuid_goal5b,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg7k1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Understand the properties of electrostatic lofting and levitation, and the role of electrical charging of the dust in the granular behavior of lunar regolih (see science goal 6g)",
      goal: context.uuid_goal7k,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg7k2 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "2",
      name: "Dust-Plasma Interaction on the Surface & Exosphere of the Moon",
      goal: context.uuid_goal7k,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg7l1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Understand the plasma properties near the lunar surface and how they respond to external drivers, particularly across the terminator",
      goal: context.uuid_goal7l,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg7l2 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "2",
      name: "Understand the origin of lunar surface potentials, how they evolve between sunlit and shadowed regions, and under what circumstances they pose a threat to exploration",
      goal: context.uuid_goal7l,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg7m1 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "1",
      name: "Establish a lunar environmental monitoring station to measure environmental variables such as temperature, vibration, dust collection, radiation, seismic activity, and gravity",
      goal: context.uuid_goal7m,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.uuid_invstg7m2 = em.create(STM_Investigation, {
      uuid: uuidv4(),
      numbering: "2",
      name: "Provide real-time environmental information relevant to daily lunar operations",
      goal: context.uuid_goal7m,
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
