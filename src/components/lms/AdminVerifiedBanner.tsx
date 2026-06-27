import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, X, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const STORAGE_KEY = "bnhs:admin-verified-banner-dismissed";

const AdminVerifiedBanner = () => {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!roles.includes("admin")) return;
    const key = `${STORAGE_KEY}:${user.id}`;
    if (localStorage.getItem(key) === "1") return;
    setShow(true);
  }, [user?.id, roles.join(",")]);

  if (!show || !user) return null;

  const dismiss = () => {
    localStorage.setItem(`${STORAGE_KEY}:${user.id}`, "1");
    setShow(false);
  };

  return (
    <div className="mx-3 mt-3">
      <div className="relative overflow-hidden rounded-2xl divine-gradient p-[1.5px] shadow-divine">
        <div className="rounded-2xl glass-dark px-4 py-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-accent/25 flex items-center justify-center shrink-0 ring-1 ring-accent/40">
            <ShieldCheck className="h-5 w-5 text-accent-glow" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-accent-glow">Admin verified</p>
            <p className="text-[13px] font-semibold text-primary-foreground leading-tight">
              You're signed in with full admin powers.
            </p>
          </div>
          <button
            onClick={() => {
              dismiss();
              navigate("/admin/diagnostics");
            }}
            className="flex items-center gap-1 text-[11px] font-bold bg-accent text-accent-foreground rounded-full px-3 py-1.5 tap-press shrink-0"
          >
            Diagnostics <ArrowRight className="h-3 w-3" />
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="p-1 rounded-full hover:bg-primary-foreground/10 text-primary-foreground/70 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminVerifiedBanner;
