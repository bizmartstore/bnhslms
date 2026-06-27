/**
 * Public Supabase client settings (safe to commit — these are exposed in the browser bundle).
 * Used when Vite env vars are missing, e.g. Lovable publish without Secrets updated.
 */
export const SUPABASE_PROJECT_REF = "rzjoqlqlqbzvjfuvqszr";

export const supabasePublicConfig = {
  url: `https://${SUPABASE_PROJECT_REF}.supabase.co`,
  publishableKey: "sb_publishable_9U-ik16-75hu86Th7EV1Qg_AXPA6t-8",
} as const;
