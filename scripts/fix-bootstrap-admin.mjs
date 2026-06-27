import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const ADMIN_EMAIL = "sheethappenswithjaa@gmail.com";
const NEW_PASSWORD = process.env.ADMIN_RESET_PASSWORD || "Bnhs@Admin2026!";

try {
  // Ensure email is confirmed and set a known password for bootstrap admin
  const updated = await sql`
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt(${NEW_PASSWORD}, extensions.gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
    WHERE email = ${ADMIN_EMAIL}
    RETURNING id, email, email_confirmed_at
  `;
  console.log("Admin password reset:", updated);

  // Apply RLS anon grants if not yet applied
  const rlsFix = readFileSync(
    join(root, "supabase/migrations/20260627120000_fix_anon_rls_function_grants.sql"),
    "utf8",
  );
  await sql.unsafe(rlsFix);
  console.log("RLS anon grants applied.");
} finally {
  await sql.end();
}
