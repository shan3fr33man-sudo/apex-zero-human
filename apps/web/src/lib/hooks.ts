'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Hook: get the current authenticated user's company list.
 */
export function useCompanies() {
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; config: Record<string, unknown> }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('companies')
      .select('id, name, config')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setCompanies(data ?? []);
        setLoading(false);
      });
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
 * Hook: Supabase Realtime subscription on a table for a given company.
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

    if (initialFetch) {
      supabase
        .from(table)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .then(({ data: rows }) => {
          setData((rows as T[]) ?? []);
          setLoading(false);
        });
    }

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
