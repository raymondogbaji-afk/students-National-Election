import { supabase } from "@/integrations/supabase/client";

export async function logAudit(entry: {
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      actor_user_id: userRes.user?.id ?? null,
      actor_label: userRes.user?.email ?? null,
      action: entry.action,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      metadata: (entry.metadata ?? {}) as never,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch (err) {
    console.warn("audit_log failed", err);
  }
}
