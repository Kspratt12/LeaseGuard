import { supabase } from "@/lib/supabase";

/** Authorization header for calls to our own API routes, or null if signed out. */
export async function getAuthHeaders(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}
