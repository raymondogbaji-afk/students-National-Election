import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expires: number }>();

/**
 * Resolves a photo path to a viewable URL.
 * Accepts either a full http(s) URL (returned as-is) or a Supabase storage path
 * inside the `candidate-photos` bucket (returned as a signed URL, cached).
 */
export async function resolvePhotoUrl(pathOrUrl: string | null | undefined): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;

  const now = Date.now();
  const hit = cache.get(pathOrUrl);
  if (hit && hit.expires > now) return hit.url;

  const { data, error } = await supabase.storage
    .from("candidate-photos")
    .createSignedUrl(pathOrUrl, 60 * 60 * 6);
  if (error || !data) return null;
  cache.set(pathOrUrl, { url: data.signedUrl, expires: now + 1000 * 60 * 60 * 5 });
  return data.signedUrl;
}
