'use client';

import { cn } from '@/lib/utils';

interface SkillData {
  id: string;
  name: string;
  version: string;
  sha?: string;
  permissions: string[];
  enabled: boolean;
  builtin: boolean;
  safety_score?: number;
}

export function SkillCard({
  skill,
  onToggle,
}: {
  skill: SkillData;
  onToggle?: (id: string, enabled: boolean) => void;
}) {
  const safetyColor =
    (skill.safety_score ?? 100) >= 80
      ? 'text-apex-accent'
      : (skill.safety_score ?? 100) >= 50
        ? 'text-apex-warning'
        : 'text-apex-danger';

  return (
    <div className="bg-apex-surface border border-apex-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-sans font-medium text-apex-text">
            {skill.name}
          </span>
          {skill.builtin && (
            <span className="text-[8px] font-mono uppercase px-1 py-0.5 rounded bg-apex-accent/10 text-apex-accent">
              Built-in
            </span>
          )}
        </div>

        {onToggle && (
          <button
            onClick={() => onToggle(skill.id, !skill.enabled)}
            className={cn(
              'w-8 h-4 rounded-full transition-colors relative',
              skill.enabled ? 'bg-apex-accent' : 'bg-apex-border'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                skill.enabled ? 'left-4' : 'left-0.5'
              )}
            />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 text-[10px] font-mono text-apex-muted mb-3">
        <span>v{skill.version}</span>
        {skill.sha && <span>SHA: {skill.sha.slice(0, 8)}</span>}
        <span className={safetyColor}>
          Safety: {skill.safety_score ?? 100}/100
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {skill.permissions.map((perm) => (
          <span
            key={perm}
            className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-apex-bg border border-apex-border text-apex-muted"
          >
            {perm}
          </span>
        ))}
      </div>
    </div>
  );
}
