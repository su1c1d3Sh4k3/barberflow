"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface QueryResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface QueryOptions {
  table: string;
  select?: string;
  filters?: Record<string, unknown>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
}

export function useSupabaseQuery<T>({
  table,
  select = "*",
  filters = {},
  order,
  limit,
}: QueryOptions): QueryResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase.from(table).select(select);

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });

    if (order) {
      query = query.order(order.column, { ascending: order.ascending ?? true });
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data: result, error: queryError } = await query;

    if (queryError) {
      setError(queryError.message);
    } else {
      setData((result as T[]) || []);
    }

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, select, JSON.stringify(filters), order?.column, order?.ascending, limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
