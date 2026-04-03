'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCompanies, useActiveCompany } from '@/lib/hooks';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Command Center', icon: '◈' },
  { href: '/companies', label: 'Companies', icon: '◆' },
  { href: '/agents', label: 'Agents', icon: '◎' },
  { href: '/issues', label: 'Issues', icon: '▦' },
  { href: '/inbox', label: 'Inbox', icon: '▤' },
  { href: '/spend', label: 'Spend', icon: '◇' },
  { href: '/skills', label: 'Skills', icon: '⬡' },
  { href: '/routines', label: 'Routines', icon: '↻' },
  { href: '/audit', label: 'Audit Log', icon: '▧' },
];

export function CompanySidebar() {
  const pathname = usePathname();
  const { companies, loading } = useCompanies();
  const { companyId, setCompanyId } = useActiveCompany();

  // Auto-select first company if none selected or if stored company no longer exists
  const storedCompanyExists = companies.some((c) => c.id === companyId);
  if ((!companyId || (!storedCompanyExists && companies.length > 0)) && companies.length > 0) {
    setCompanyId(companies[0].id);
  }

  return (
    <aside className="w-sidebar flex-shrink-0 bg-apex-surface border-r border-apex-border flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-apex-border">
        <span className="font-mono text-lg font-bold text-apex-accent tracking-widest">
          APEX
        </span>
      </div>

      {/* Company Switcher */}
      <div className="p-3 border-b border-apex-border">
        <label className="block text-[10px] text-apex-muted font-mono uppercase tracking-widest mb-1">
          Company
        </label>
        {loading ? (
          <div className="h-8 bg-apex-border rounded animate-pulse" />
        ) : (
          <select
            value={companyId ?? ''}
            onChange={(e) => setCompanyId(e.target.value)}
            className="w-full text-sm bg-apex-bg border border-apex-border rounded px-2 py-1.5
              text-apex-text focus:border-apex-accent focus:outline-none font-sans"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-auto py-2">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 text-sm font-sans transition-colors',
                active
                  ? 'text-apex-accent bg-apex-accent/10 border-r-2 border-apex-accent'
                  : 'text-apex-muted hover:text-apex-text hover:bg-apex-bg'
              )}
            >
              <span className="text-base w-5 text-center font-mono">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-apex-border">
        <div className="text-[10px] text-apex-muted font-mono">
          APEX v1.0.0
        </div>
      </div>
    </aside>
  );
}
