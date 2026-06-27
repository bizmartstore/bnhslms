import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle, Loader2, Database, Shield, ArrowLeft, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import LMSHeader from "@/components/lms/LMSHeader";

type Op = "select" | "insert" | "update" | "delete";

type CheckResult = {
  table: string;
  op: Op;
  expected: "allow" | "deny";
  passed: boolean;
  error: string;
};

const SAMPLE_TAG = "[SAMPLE]";

const AdminDiagnosticsPage = () => {
  const { roles, user } = useAuth();
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [resetting, setResetting] = useState(false);
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
          <h1 className="text-lg font-bold font-display">Admin only</h1>
          <p className="text-sm text-muted-foreground mt-1">You need an admin role to view diagnostics.</p>
          <Button className="mt-4 rounded-xl" onClick={() => navigate("/")}>Go home</Button>
        </div>
      </div>
    );
  }

  const probe = async (
    table: string,
    op: Op,
    expected: "allow" | "deny",
    fn: () => Promise<{ error: any }>,
  ): Promise<CheckResult> => {
    try {
      const { error } = await fn();
      const passed = expected === "allow" ? !error : !!error;
      return { table, op, expected, passed, error: error?.message || "—" };
    } catch (e: any) {
      return { table, op, expected, passed: expected === "deny", error: e?.message || String(e) };
    }
  };

  const runChecks = async () => {
    if (!user) return;
    setRunning(true);
    const out: CheckResult[] = [];

    // SELECT probes — admin should be allowed everywhere
    const tables = [
      "events", "announcements", "sections", "section_join_requests",
      "student_term_grades", "subjects", "banners", "event_images",
      "profiles", "user_roles", "section_members",
    ] as const;
    for (const t of tables) {
      out.push(await probe(t, "select", "allow", () =>
        (supabase.from(t as any).select("*").limit(1) as any),
      ));
    }

    // Deny probe — passcode hash column must not be selectable
    out.push(await probe("sections.join_passcode_hash", "select", "deny", () =>
      (supabase.from("sections").select("join_passcode_hash").limit(1) as any),
    ));

    // INSERT probes (admin should be allowed; uses safe sample tag)
    out.push(await probe("announcements", "insert", "allow", () =>
      (supabase.from("announcements").insert({
        title: `${SAMPLE_TAG} diag insert`,
        from_name: "Diagnostics",
        preview_text: "probe",
        full_content: "probe",
        scope: "global",
        is_active: false,
      } as any).select().single() as any),
    ));
    out.push(await probe("events", "insert", "allow", () =>
      (supabase.from("events").insert({
        title: `${SAMPLE_TAG} diag insert`,
        content: "probe",
        sort_order: 999,
        is_active: false,
      } as any).select().single() as any),
    ));

    // UPDATE + DELETE probes — clean up what we just inserted
    out.push(await probe("announcements", "update", "allow", () =>
      (supabase.from("announcements").update({ preview_text: "updated" })
        .eq("title", `${SAMPLE_TAG} diag insert`) as any),
    ));
    out.push(await probe("announcements", "delete", "allow", () =>
      (supabase.from("announcements").delete().eq("title", `${SAMPLE_TAG} diag insert`) as any),
    ));
    out.push(await probe("events", "update", "allow", () =>
      (supabase.from("events").update({ content: "updated" })
        .eq("title", `${SAMPLE_TAG} diag insert`) as any),
    ));
    out.push(await probe("events", "delete", "allow", () =>
      (supabase.from("events").delete().eq("title", `${SAMPLE_TAG} diag insert`) as any),
    ));

    setResults(out);
    setRunning(false);
    const failed = out.filter((c) => !c.passed).length;
    if (failed === 0) toast.success(`All ${out.length} RLS probes passed`);
    else toast.error(`${failed} of ${out.length} probes failed`);
  };

  const seedSampleData = async () => {
    if (!user) return;
    if (!confirm("Insert sample events, announcements, subjects, and a section?")) return;
    setSeeding(true);
    try {
      const subjectsPayload = [
        { name: `${SAMPLE_TAG} Mathematics`, code: "MATH-7", grade_level: "Grade 7", school_level: "junior_high_school" as const, color: "#1e6b3a", is_active: true },
        { name: `${SAMPLE_TAG} English`, code: "ENG-7", grade_level: "Grade 7", school_level: "junior_high_school" as const, color: "#0d7a5f", is_active: true },
        { name: `${SAMPLE_TAG} Science`, code: "SCI-7", grade_level: "Grade 7", school_level: "junior_high_school" as const, color: "#13361f", is_active: true },
      ];
      for (const s of subjectsPayload) {
        const { data: existing } = await supabase.from("subjects").select("id").eq("name", s.name).maybeSingle();
        if (!existing) await supabase.from("subjects").insert(s as any);
      }

      const { data: existingEv } = await supabase.from("events").select("id").eq("title", `${SAMPLE_TAG} Welcome to BNHS LMS`).maybeSingle();
      if (!existingEv) {
        await supabase.from("events").insert({
          title: `${SAMPLE_TAG} Welcome to BNHS LMS`,
          content: "Sample event seeded for testing.",
          sort_order: 0,
          is_active: true,
        } as any);
      }

      const { data: existingAnn } = await supabase.from("announcements").select("id").eq("title", `${SAMPLE_TAG} Sample announcement`).maybeSingle();
      if (!existingAnn) {
        await supabase.from("announcements").insert({
          title: `${SAMPLE_TAG} Sample announcement`,
          from_name: "Admin",
          preview_text: "Seeded global announcement.",
          full_content: "You can edit or remove this from Admin → Announcements.",
          scope: "global",
          is_new: true,
          is_active: true,
        } as any);
      }

      const { data: existingSec } = await supabase.from("sections").select("id").eq("name", `${SAMPLE_TAG} Sample Section A`).maybeSingle();
      if (!existingSec) {
        await supabase.from("sections").insert({
          name: `${SAMPLE_TAG} Sample Section A`,
          teacher_id: user.id,
          grade_level: "Grade 7",
          school_level: "junior_high_school",
          color: "#1e6b3a",
          description: "Seeded sample section",
          is_active: true,
        } as any);
      }

      toast.success("Sample data inserted");
    } catch (e: any) {
      toast.error(e?.message || "Failed to seed");
    } finally {
      setSeeding(false);
    }
  };

  const resetSampleData = async () => {
    if (!confirm("Delete ALL previously inserted sample data (anything tagged with [SAMPLE])? This cannot be undone.")) return;
    setResetting(true);
    try {
      const like = `${SAMPLE_TAG}%`;
      const deletions = await Promise.all([
        supabase.from("subjects").delete().like("name", like),
        supabase.from("events").delete().like("title", like),
        supabase.from("announcements").delete().like("title", like),
        supabase.from("sections").delete().like("name", like),
      ]);
      const firstError = deletions.find((d) => d.error)?.error;
      if (firstError) throw firstError;
      toast.success("Sample data cleared");
    } catch (e: any) {
      toast.error(e?.message || "Failed to reset");
    } finally {
      setResetting(false);
    }
  };

  const opColor = (op: Op) => ({
    select: "bg-info/15 text-info",
    insert: "bg-success/15 text-success",
    update: "bg-warning/15 text-warning",
    delete: "bg-destructive/15 text-destructive",
  }[op]);

  return (
    <div className="min-h-screen bg-background pb-16">
      <LMSHeader />
      <div className="p-4 max-w-3xl mx-auto space-y-4">
        <button onClick={() => navigate("/admin")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to Admin Dashboard
        </button>

        <div>
          <h1 className="text-2xl font-display flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Admin Diagnostics
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Per-table, per-operation RLS probes plus sample data tools.
          </p>
        </div>

        <Card className="p-4 space-y-3 forest-glow">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="font-bold text-sm">RLS probes</h2>
              <p className="text-[11px] text-muted-foreground">Runs select / insert / update / delete probes against each table.</p>
            </div>
            <Button size="sm" onClick={runChecks} disabled={running} className="rounded-xl">
              {running ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Run probes
            </Button>
          </div>

          {results.length > 0 && (
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs p-2.5 rounded-xl bg-muted/40">
                  {r.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge className={`text-[9px] uppercase ${opColor(r.op)} border-0`}>{r.op}</Badge>
                      <span className="font-mono text-[11px] font-semibold break-all">{r.table}</span>
                      <Badge variant="outline" className="text-[9px]">expect {r.expected}</Badge>
                    </div>
                    {r.error !== "—" && (
                      <p className="text-[11px] text-muted-foreground mt-1 break-words">{r.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-3 forest-glow">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="font-bold text-sm flex items-center gap-1"><Database className="h-4 w-4" /> Sample data</h2>
              <p className="text-[11px] text-muted-foreground">Tagged with <code className="text-[10px]">[SAMPLE]</code> for safe cleanup.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={resetSampleData} disabled={resetting} className="rounded-xl">
                {resetting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                Reset sample data
              </Button>
              <Button size="sm" variant="secondary" onClick={seedSampleData} disabled={seeding} className="rounded-xl">
                {seeding ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                Insert sample data
              </Button>
            </div>
          </div>
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-xl p-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Reset deletes every row whose name/title starts with <code>[SAMPLE]</code> across subjects, events, announcements, and sections.</span>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminDiagnosticsPage;
