'use client';

import { useState, useEffect } from 'react';
import { useActiveCompany } from '@/lib/hooks';
import { SkillCard } from '@/components/SkillCard';
import { createClient } from '@/lib/supabase/client';

interface SkillRow {
  id: string;
  name: string;
  version: string;
  sha?: string;
  permissions: string[];
  enabled: boolean;
  builtin: boolean;
  safety_score?: number;
  company_id: string;
}

const BUILTIN_SKILLS: Omit<SkillRow, 'company_id'>[] = [
  { id: 'web-browser', name: 'Web Browser', version: '2.0.0', permissions: ['network.http', 'network.firecrawl'], enabled: true, builtin: true, safety_score: 100 },
  { id: 'email-reader', name: 'Email Reader', version: '1.0.0', permissions: ['network.http'], enabled: true, builtin: true, safety_score: 100 },
  { id: 'phone-listener', name: 'Phone Listener', version: '1.0.0', permissions: ['network.http'], enabled: true, builtin: true, safety_score: 100 },
  { id: 'crm-connector', name: 'CRM Connector', version: '1.0.0', permissions: ['network.http'], enabled: true, builtin: true, safety_score: 100 },
  { id: 'calendar-manager', name: 'Calendar Manager', version: '1.0.0', permissions: ['network.http'], enabled: true, builtin: true, safety_score: 100 },
  { id: 'ads-manager', name: 'Ads Manager', version: '1.0.0', permissions: ['network.http'], enabled: true, builtin: true, safety_score: 100 },
  { id: 'review-requester', name: 'Review Requester', version: '1.0.0', permissions: ['network.http'], enabled: true, builtin: true, safety_score: 100 },
  { id: 'document-generator', name: 'Document Generator', version: '1.0.0', permissions: ['filesystem.write'], enabled: true, builtin: true, safety_score: 100 },
  { id: 'firecrawl', name: 'Firecrawl', version: '1.0.0', permissions: ['network.firecrawl'], enabled: true, builtin: true, safety_score: 100 },
];

type Tab = 'builtin' | 'installed' | 'install';

export default function SkillsPage() {
  const { companyId } = useActiveCompany();
  const [activeTab, setActiveTab] = useState<Tab>('builtin');
  const [installUrl, setInstallUrl] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installedSkills, setInstalledSkills] = useState<SkillRow[]>([]);

  useEffect(() => {
    if (!companyId) return;
    const supabase = createClient();
    supabase
      .from('installed_skills')
      .select('*')
      .eq('company_id', companyId)
      .then(({ data }) => {
        setInstalledSkills((data as SkillRow[]) ?? []);
      });
  }, [companyId]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'builtin', label: 'Built-in Skills' },
    { key: 'installed', label: 'Installed Skills' },
    { key: 'install', label: 'Install New' },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-sans font-semibold text-apex-text">Skills</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-apex-surface border border-apex-border rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 text-sm font-sans py-2 px-4 rounded transition-colors ${
              activeTab === tab.key
                ? 'bg-apex-accent/10 text-apex-accent'
                : 'text-apex-muted hover:text-apex-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Built-in Tab */}
      {activeTab === 'builtin' && (
        <div className="grid grid-cols-2 gap-4">
          {BUILTIN_SKILLS.map((skill) => (
            <SkillCard key={skill.id} skill={skill} />
          ))}
        </div>
      )}

      {/* Installed Tab */}
      {activeTab === 'installed' && (
        <div>
          {installedSkills.length === 0 ? (
            <div className="text-center py-16 text-apex-muted font-sans">
              No external skills installed yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {installedSkills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Install New Tab */}
      {activeTab === 'install' && (
        <div className="max-w-lg">
          <p className="text-sm text-apex-muted font-sans mb-4">
            Install a skill from a URL. The skill will be scanned for security
            issues before activation.
          </p>
          <div className="flex gap-2">
            <input
              value={installUrl}
              onChange={(e) => setInstallUrl(e.target.value)}
              className="flex-1"
              placeholder="https://github.com/org/apex-skill-example.git"
            />
            <button
              disabled={installing || !installUrl.trim()}
              className="text-sm font-sans font-medium py-2 px-4 rounded
                bg-apex-accent text-apex-bg hover:bg-apex-accent/90 disabled:opacity-50"
            >
              {installing ? 'Scanning...' : 'Install'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
