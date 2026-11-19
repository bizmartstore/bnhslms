import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isBootstrapAdmin } from "@/lib/auth-config";
import { ensureBootstrapAdmin } from "@/lib/signup-profile";

type Profile = {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  contact_number: string;
  user_type: "student" | "teacher";
  school: string | null;
  grade_level: string | null;
  school_level: "elementary" | "junior_high_school" | null;
  subject_taught: string | null;
  approval_status: "pending" | "approved" | "rejected";
  avatar_data?: string | null;
};

type UserRole = "admin" | "student" | "teacher";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: UserRole[];
  loading: boolean;
  /** True while the profile for the current signed-in user is still being loaded. */
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  roles: [],
  loading: true,
  profileLoading: false,
  signOut: async () => {},
  refreshProfile: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileForUserId, setProfileForUserId] = useState<string | null>(null);

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      // Keep the previously loaded profile instead of bouncing the user back to
      // "Complete your profile" on a transient network/RLS error.
      console.error("[auth] Failed to load profile:", error.message);
      return null;
    }
    const nextProfile = data as Profile | null;
    setProfile(nextProfile);
    return nextProfile;
  };

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    setRoles((data || []).map((r) => r.role as UserRole));
  };

  const loadProfileForUser = async (authUser: User): Promise<Profile | null> => {
    let nextProfile: Profile | null = null;
    try {
      nextProfile = await fetchProfile(authUser.id);
      // The default admin must never be stranded on "Complete your profile".
      // If the row is missing (e.g. account created before the auth trigger),
      // provision it once and load it again.
      if (!nextProfile && isBootstrapAdmin(authUser.email)) {
        await ensureBootstrapAdmin(authUser.id, authUser.email);
        nextProfile = await fetchProfile(authUser.id);
      }
      await fetchRoles(authUser.id);
    } finally {
      // Marks the profile as resolved for this user, even when it is null, so
      // route guards do not redirect while the request is still in flight.
      setProfileForUserId(authUser.id);
    }
    return nextProfile;
  };

  const refreshProfile = async (): Promise<Profile | null> => {
    // Read the user from the auth client: callers such as the login handler may
    // hold a stale `user` value from before the sign-in event was processed.
    const { data } = await supabase.auth.getUser();
    const authUser = data.user;
    if (!authUser) return null;
    return loadProfileForUser(authUser);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setProfileForUserId(null);
  };

  useEffect(() => {
    const safetyTimer = window.setTimeout(() => setLoading(false), 10_000);
    return () => window.clearTimeout(safetyTimer);
  }, []);

  useEffect(() => {
    // does not inherit the sender's session.
    try {
      const url = new URL(window.location.href);
      const isGuestLink =
        url.searchParams.get("guest") === "1" ||
        url.hash.includes("guest");
      if (isGuestLink) {
        supabase.auth.signOut();
        url.searchParams.delete("guest");
        url.hash = url.hash.replace(/#?guest/, "");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {}

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          const authUser = session.user;
          setTimeout(async () => {
            await loadProfileForUser(authUser);
            setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setProfileForUserId(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfileForUser(session.user).then(() => setLoading(false));
      } else {
        setProfileForUserId(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const refreshOnVisible = () => {
      if (document.visibilityState !== "visible" || !user) return;
      void loadProfileForUser(user);
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => document.removeEventListener("visibilitychange", refreshOnVisible);
  }, [user?.id]);

  const profileLoading = !!user && profileForUserId !== user.id;

  return (
    <AuthContext.Provider value={{ user, session, profile, roles, loading, profileLoading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
