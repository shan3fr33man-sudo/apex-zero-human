/**
 * Goal Ancestry Chain — every agent task traces back to the company mission.
 * mission → objective → role → task
 */
export interface GoalAncestry {
  mission: string;       // Company-level north star (from companies.mission)
  objective: string;     // Project/sprint objective (from parent issue or project)
  role: string;          // Agent's role label
  task: string;          // The specific issue title + description
}

export function formatGoalAncestryForPrompt(ancestry: GoalAncestry): string {
  return `<goal_ancestry>
You are ${ancestry.role}.
Your task: ${ancestry.task}
This serves objective: ${ancestry.objective}
Which achieves mission: ${ancestry.mission}
</goal_ancestry>`;
}
