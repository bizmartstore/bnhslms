import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle, Loader2, Database, Shield, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import LMSHeader from "@/components/lms/LMSHeader";

type CheckResult = {
  name: string;
  table: string;
  expected: "allow" | "deny";
  passed: boolean | null;
  detail: string;
};

const AdminDiagnosticsPage = () => {
  const { roles, user } = useAuth();
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);

  const isAdmin = roles.includes("admin");

  if (!user) {
    navigate("/login");
    return null;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <LMSHeader />
        <div className="p-6 max-w-md mx-auto mt-12 text-center">
          <Shield className="h-12 w-12 text-destructive mx-auto mb-3" />
          <h1 className="text-lg font-bold">Admin only</h1>
          <p className="text-sm text-muted-foreground mt-1">You need an admin role to view diagnostics.</p>
          <Button className="mt-4" onClick={() => navigate("/")}>Go home</Button>
        </div>
      </div>
    );
  }

  const runChecks = async () => {
    setRunning(true);
    const checks: CheckResult[] = [];

    const probe = async (
      name: string,
      table: string,
      expected: "allow" | "deny",
      fn: () => Promise<{ error: { message: string } | null }>,
    ) => {
      try {
        const { error } = await fn();
        const ok = expected === "allow" ? !error : !!error;
        checks.push({
          name,
          table,
          expected,
          passed: ok,
          detail: error ? error.message : "ok",
        });
      } catch (e: any) {
        checks.push({ name, table, expected, passed: false, detail: e?.message || String(e) });
      }
    };

    // Read checks (admin should see everything)
    await probe("Admin can read events", "events", "allow", () =>
      supabase.from("events").select("id").limit(1) as any,
    );
    await probe("Admin can read announcements", "announcements", "allow", () =>
      supabase.from("announcements").select("id").limit(1) as any,
    );
    await probe("Admin can read sections", "sections", "allow", () =>
      supabase.from("sections").select("id").limit(1) as any,
    );
    await probe("Admin can read section_join_requests", "section_join_requests", "allow", () =>
      supabase.from("section_join_requests").select("id").limit(1) as any,
    );
    await probe("Admin can read student_term_grades", "student_term_grades", "allow", () =>
      supabase.from("student_term_grades").select("id").limit(1) as any,
    );
    await probe("Admin can read subjects", "subjects", "allow", () =>
      supabase.from("subjects").select("id").limit(1) as any,
    );

    // Write check that should be blocked (passcode hash column is revoked from clients)
    await probe(
      "Passcode hash column is hidden from clients",
      "sections.join_passcode_hash",
      "deny",
      () => supabase.from("sections").select("join_passcode_hash").limit(1) as any,
    );

    setResults(checks);
    setRunning(false);
    const failed = checks.filter((c) => c.passed === false).length;
    if (failed === 0) toast.success("All RLS checks passed");
    else toast.error(`${failed} check(s) failed`);
  };

  const seedSampleData = async () => {
    if (!confirm("Insert sample events, announcements, subjects, and a section? This is safe to run multiple times.")) return;
    setSeeding(true);
    try {
      // Sample subjects (idempotent by name+grade)
      const subjectsPayload = [
        { name: "Mathematics", code: "MATH-7", grade_level: "Grade 7", school_level: "junior_high_school" as const, color: "#f97316", is_active: true },
        { name: "English", code: "ENG-7", grade_level: "Grade 7", school_level: "junior_high_school" as const, color: "#3b82f6", is_active: true },
        { name: "Science", code: "SCI-7", grade_level: "Grade 7", school_level: "junior_high_school" as const, color: "#10b981", is_active: true },
      ];
      for (const s of subjectsPayload) {
        const { data: existing } = await supabase
          .from("subjects")
          .select("id")
          .eq("name", s.name)
          .eq("grade_level", s.grade_level)
          .maybeSingle();
        if (!existing) await supabase.from("subjects").insert(s as any);
      }

      // Sample event
      const { data: existingEv } = await supabase
        .from("events")
        .select("id")
        .eq("title", "Welcome to BNHS LMS")
        .maybeSingle();
      if (!existingEv) {
        await supabase.from("events").insert({
          title: "Welcome to BNHS LMS",
          content: "Sample event seeded for testing. Edit or delete from Admin → Events.",
          sort_order: 0,
          is_active: true,
        } as any);
      }

      // Sample announcement
      const { data: existingAnn } = await supabase
        .from("announcements")
        .select("id")
        .eq("title", "Sample announcement")
        .maybeSingle();
      if (!existingAnn) {
        await supabase.from("announcements").insert({
          title: "Sample announcement",
          from_name: "Admin",
          preview_text: "This is a seeded global announcement.",
          full_content: "You can edit or remove this from Admin → Announcements.",
          scope: "global",
          is_new: true,
          is_active: true,
        } as any);
      }

      // Sample section (owned by current admin user, acts as adviser)
      if (user) {
        const { data: existingSec } = await supabase
          .from("sections")
          .select("id")
          .eq("name", "Sample Section A")
          .maybeSingle();
        if (!existingSec) {
          await supabase.from("sections").insert({
            name: "Sample Section A",
            teacher_id: user.id,
            grade_level: "Grade 7",
            school_level: "junior_high_school",
            color: "#f97316",
            description: "Seeded sample section",
            is_active: true,
          } as any);
        }
      }

      toast.success("Sample data inserted");
    } catch (e: any) {
      toast.error(e?.message || "Failed to seed");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <LMSHeader />
      <div className="p-4 max-w-3xl mx-auto space-y-4">
        <button onClick={() => navigate("/admin")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to Admin Dashboard
        </button>

        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Admin Diagnostics
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Verify row-level security policies on key tables and seed sample data for testing.
          </p>
        </div>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm">RLS policy checks</h2>
              <p className="text-[11px] text-muted-foreground">Runs read probes against key tables.</p>
            </div>
            <Button size="sm" onClick={runChecks} disabled={running}>
              {running ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Run checks
            </Button>
          </div>

          {results.length > 0 && (
            <div className="space-y-1.5">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-muted/40">
                  {r.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-muted-foreground truncate">
                      <Badge variant="outline" className="text-[9px] mr-1">{r.table}</Badge>
                      expect {r.expected} — {r.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm flex items-center gap-1"><Database className="h-4 w-4" /> Sample data</h2>
              <p className="text-[11px] text-muted-foreground">Populates events, announcements, subjects, and a sample section.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={seedSampleData} disabled={seeding}>
              {seeding ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Insert sample data
            </Button>
          </div>
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Safe to run more than once — items are inserted only if they don't already exist.</span>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminDiagnosticsPage;
