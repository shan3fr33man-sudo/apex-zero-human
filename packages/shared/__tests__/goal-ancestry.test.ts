import { describe, it, expect } from 'vitest';
import { formatGoalAncestryForPrompt, type GoalAncestry } from '../goal-ancestry';

describe('GoalAncestry', () => {
  const ancestry: GoalAncestry = {
    mission: 'Become the #1 moving company in WA state',
    objective: 'Launch automated lead recovery',
    role: 'Lead Recovery Agent',
    task: 'Follow up on missed call from 206-555-1234',
  };

  it('formats ancestry into XML block', () => {
    const result = formatGoalAncestryForPrompt(ancestry);
    expect(result).toContain('<goal_ancestry>');
    expect(result).toContain('</goal_ancestry>');
  });

  it('includes all 4 chain levels', () => {
    const result = formatGoalAncestryForPrompt(ancestry);
    expect(result).toContain(ancestry.mission);
    expect(result).toContain(ancestry.objective);
    expect(result).toContain(ancestry.role);
    expect(result).toContain(ancestry.task);
  });

  it('maintains correct hierarchy order: role → task → objective → mission', () => {
    const result = formatGoalAncestryForPrompt(ancestry);
    const roleIdx = result.indexOf('You are');
    const taskIdx = result.indexOf('Your task:');
    const objIdx = result.indexOf('This serves objective:');
    const missionIdx = result.indexOf('Which achieves mission:');

    expect(roleIdx).toBeLessThan(taskIdx);
    expect(taskIdx).toBeLessThan(objIdx);
    expect(objIdx).toBeLessThan(missionIdx);
  });

  it('handles empty strings gracefully', () => {
    const empty: GoalAncestry = { mission: '', objective: '', role: '', task: '' };
    const result = formatGoalAncestryForPrompt(empty);
    expect(result).toContain('<goal_ancestry>');
    expect(result).toContain('</goal_ancestry>');
  });
});
