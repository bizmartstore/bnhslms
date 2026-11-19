import { supabase } from "@/integrations/supabase/client";
import { isBootstrapAdmin } from "@/lib/auth-config";

export type SignupProfilePayload = {
  first_name: string;
  last_name: string;
  contact_number: string;
  user_type: "student" | "teacher";
  school?: string | null;
  grade_level?: string | null;
  school_level?: "elementary" | "junior_high_school" | null;
  subject_taught?: string | null;
};

export async function signUpWithProfile(email: string, password: string, profile: SignupProfilePayload) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: profile.first_name,
        last_name: profile.last_name,
        contact_number: profile.contact_number,
        user_type: profile.user_type,
        school: profile.school ?? null,
        grade_level: profile.grade_level ?? null,
        school_level: profile.school_level ?? null,
        subject_taught: profile.subject_taught ?? null,
      },
    },
  });

  if (error) throw error;
  if (!data.user) throw new Error("Signup failed");

  if (data.session) {
    const { error: profileError } = await supabase.rpc("create_user_profile", {
      _first_name: profile.first_name,
      _last_name: profile.last_name,
      _contact_number: profile.contact_number,
      _user_type: profile.user_type,
      _school: profile.school ?? null,
      _grade_level: profile.grade_level ?? null,
      _school_level: profile.school_level ?? null,
      _subject_taught: profile.subject_taught ?? null,
    });
    if (profileError) throw profileError;
  }

  if (isBootstrapAdmin(email) && data.session) {
    await supabase.rpc("grant_admin_role", { _user_id: data.user.id });
  }

  return data;
}

export function getSignupSuccessMessage(email: string, hasSession: boolean, userType: "student" | "teacher"): string {
  if (!hasSession) {
    return "Account created! Check your email to confirm your address, then log in.";
  }
  if (isBootstrapAdmin(email)) {
    return "Admin account created! You can log in now.";
  }
  return userType === "teacher"
    ? "Account created! Please wait for admin approval before logging in."
    : "Account created! Please wait for teacher approval before logging in.";
}

export async function ensureBootstrapAdmin(userId: string, email: string | undefined | null) {
  if (!isBootstrapAdmin(email)) return;

  // The bootstrap account is special-cased for approval/roles, but that only
  // works if a profiles row exists. Accounts created before the auth trigger
  // (or re-created/migrated outside signup) have none, which strands the admin
  // on the "Complete your profile" screen. Create a default profile once.
  const { data: existing, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    console.warn("[auth] Failed to check bootstrap admin profile:", profileError.message);
  }

  if (!existing) {
    const { data: authData } = await supabase.auth.getUser();
    const meta = (authData.user?.user_metadata ?? {}) as Record<string, string | null | undefined>;

    const { error: createError } = await supabase.rpc("create_user_profile", {
      _first_name: meta.first_name || "BNHS",
      _last_name: meta.last_name || "Admin",
      _contact_number: meta.contact_number || "",
      _user_type: "teacher",
      _subject_taught: meta.subject_taught || "Administration",
    });
    if (createError) {
      console.warn("[auth] Failed to create bootstrap admin profile:", createError.message);
    }
  }

  await supabase.rpc("grant_admin_role", { _user_id: userId });
  await supabase
    .from("profiles")
    .update({ approval_status: "approved" })
    .eq("user_id", userId);
}
