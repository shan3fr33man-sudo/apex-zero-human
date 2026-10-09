/**
 * Shared pagination utilities for API routes.
 *
 * Usage:
 *   const { offset, limit, page } = parsePagination(request.nextUrl.searchParams);
 *   const query = supabase.from('table').select('*', { count: 'exact' }).range(offset, offset + limit - 1);
 *   return paginatedResponse(data, count, page, limit);
 */
import { NextResponse } from 'next/server';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function parsePagination(params: URLSearchParams) {
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function paginatedResponse<T>(data: T[] | null, totalCount: number | null, page: number, limit: number) {
  const total = totalCount ?? 0;
  return NextResponse.json({
    data: data ?? [],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  });
}
