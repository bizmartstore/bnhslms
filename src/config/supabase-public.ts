/**
 * Public Supabase client settings (safe to commit — these are exposed in the browser bundle).
 * Used when Vite env vars are missing, e.g. Lovable publish without Secrets updated.
 */
export const SUPABASE_PROJECT_REF = "mbfiomejosyennlbtnzd";

export const supabasePublicConfig = {
  url: `https://${SUPABASE_PROJECT_REF}.supabase.co`,
  publishableKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iZmlvbWVqb3N5ZW5ubGJ0bnpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MTYwNzIsImV4cCI6MjA5ODA5MjA3Mn0.QXY2xtx-x4IOVMXmEH7gDXviQkjT_w7OxxBsDV4Njyg",
} as const;
