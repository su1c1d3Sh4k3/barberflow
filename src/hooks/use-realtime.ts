"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface RealtimeOptions {
  table: string;
  filter?: string;
  onInsert?: (payload: Record<string, unknown>) => void;
  onUpdate?: (payload: Record<string, unknown>) => void;
  onDelete?: (payload: Record<string, unknown>) => void;
  enabled?: boolean;
}

export function useRealtime({
  table,
  filter,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: RealtimeOptions) {
  const supabase = createClient();

  useEffect(() => {
    if (!enabled) return;

    const channelName = `realtime-${table}-${filter || "all"}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: filter || undefined,
        },
        (payload) => {
          switch (payload.eventType) {
            case "INSERT":
              onInsert?.(payload.new as Record<string, unknown>);
              break;
            case "UPDATE":
              onUpdate?.(payload.new as Record<string, unknown>);
              break;
            case "DELETE":
              onDelete?.(payload.old as Record<string, unknown>);
              break;
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter, enabled]);
}
