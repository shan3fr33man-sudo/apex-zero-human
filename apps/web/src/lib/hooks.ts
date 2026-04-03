'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Hook: get the current authenticated user's company list.
 */
export function useCompanies() {
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; slug: string; description: string | null; status: string; settings: Record<string, unknown> }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/apex/companies')
      .then(r => r.json())
      .then(data => {
        setCompanies(data.companies ?? data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { companies, loading };
}

/**
 * Hook: currently selected company ID stored in localStorage.
 */
export function useActiveCompany() {
  const [companyId, setCompanyIdState] = useState<string | null>(null);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('apex-active-company') : null;
    if (stored) setCompanyIdState(stored);
  }, []);

  const setCompanyId = useCallback((id: string) => {
    setCompanyIdState(id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('apex-active-company', id);
    }
  }, []);

  return { companyId, setCompanyId };
}

/**
 * Hook: Fetch initial data from API route, then subscribe to Supabase Realtime for live updates.
 */
export function useRealtimeTable<T extends { id: string }>(
  table: string,
  companyId: string | null,
  initialFetch = true
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const supabase = createClient();

    // Initial fetch from API route
    if (initialFetch) {
      fetch(`/api/apex/${table}?company_id=${companyId}`)
        .then(r => r.json())
        .then(result => {
          // API returns { [table]: [...], count } — extract the array
          const rows = Array.isArray(result) ? result : (result[table] ?? result.data ?? Object.values(result).find(v => Array.isArray(v)) ?? []);
          setData((rows as T[]) ?? []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`${table}:${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          setData((prev) => {
            if (payload.eventType === 'INSERT')
              return [payload.new as T, ...prev];
            if (payload.eventType === 'UPDATE')
              return prev.map((item) =>
                item.id === (payload.new as T).id ? (payload.new as T) : item
              );
            if (payload.eventType === 'DELETE')
              return prev.filter(
                (item) => item.id !== (payload.old as { id: string }).id
              );
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, companyId, initialFetch]);

  return { data, loading, setData };
}
