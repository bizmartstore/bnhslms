/**
 * Copy public LMS data from an old Supabase project to a new one.
 * Requires service role keys (Dashboard → Settings → API → service_role).
 *
 *   npm run db:migrate-data
 */
import { createClient } from "@supabase/supabase-js";

const OLD_URL = process.env.OLD_SUPABASE_URL || "https://mbfiomejosyennlbtnzd.supabase.co";
const OLD_KEY = process.env.OLD_SUPABASE_SERVICE_KEY;
const NEW_URL = process.env.NEW_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const NEW_KEY = process.env.NEW_SUPABASE_SERVICE_KEY;

const TABLES_IN_ORDER = [
  "subjects",
  "banners",
  "announcements",
  "tasks",
  "lessons",
  "events",
  "event_images",
  "sections",
  "teacher_subjects",
  "section_subjects",
  "class_schedules",
  "activities",
  "materials",
  "quizzes",
  "quiz_questions",
  "quiz_choices",
] as const;

if (!OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error(`
Missing service role keys. Add to .env:

  OLD_SUPABASE_SERVICE_KEY="..."   # old project service_role key
  NEW_SUPABASE_SERVICE_KEY="..."   # new project service_role key
  NEW_SUPABASE_URL="https://rzjoqlqlqbzvjfuvqszr.supabase.co"

Then run: npm run db:migrate-data
`);
  process.exit(1);
}

const oldDb = createClient(OLD_URL, OLD_KEY, { auth: { persistSession: false } });
const newDb = createClient(NEW_URL, NEW_KEY, { auth: { persistSession: false } });

const copyTable = async (table: string) => {
  const { data, error } = await oldDb.from(table).select("*");
  if (error) throw new Error(`${table} read: ${error.message}`);
  if (!data?.length) {
    console.log(`  ${table}: 0 rows (skip)`);
    return;
  }

  const { error: insertError } = await newDb.from(table).upsert(data, { onConflict: "id" });
  if (insertError) throw new Error(`${table} write: ${insertError.message}`);
  console.log(`  ${table}: ${data.length} rows`);
};

const main = async () => {
  console.log(`Migrating data from ${OLD_URL} → ${NEW_URL}\n`);

  for (const table of TABLES_IN_ORDER) {
    console.log(`Copying ${table}...`);
    await copyTable(table);
  }

  console.log("\nDone. Auth users are NOT copied — users must re-register or use Supabase Auth export/import.");
};

main().catch((err) => {
  console.error("\nMigration failed:", err.message ?? err);
  process.exit(1);
});
