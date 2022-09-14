/**
 * Science Traceability Matrix (STM) shaped like:
 *
 * 1. Mission A (e.g. Artemis 3)
 *    1. Objective 1
 *       a. Goal A
 *          1. Investigation 1
 *          2. Investigation 2
 *       b. Goal B
 *       c. Goal C
 *    2. Objective 2
 * 2. Mission B
 *    1. ...
 */

type STMInvestigation = {
	id: string; // e.g. "investigation-1"
	label: string; // e.g. "Inventory, relationships, and ages of nonmare rocks"
	traceability: string; // e.g. "ASM-NC1; ASM-NC2; ASM-3; LER Objective; Sci-A-9"
	sciPriority: "H" | "M" | "L"; // High, Medium, Low
	enabledByA3: boolean;
	parentGoalId: string;
};
type STMGoal = {
	id: string; // e.g. "goal-1"
	label: string; // e.g. "Differentiation: Magma Oceans, Crust, and Mantle"
	investigations: STMInvestigation[];
	parentObjectiveId: string;
};
type STMObjective = {
	id: string; // e.g. "objective-1"
	label: string; // Understanding Planetary Processes
	goals: STMGoal[];
};
/**
 * Group objectives by mission
 */
type STMMissionSet = {
	mission: string; // Artemis 1
	objectives: STMObjective[];
};

/**
 * A reference to any part of the STM hierarchy
 */
type STMRef = {
	reftype: "investigation" | "goal" | "objective";
	id: string;
};
