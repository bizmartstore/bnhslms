import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSectionMembership } from "@/hooks/useSectionMembership";
import {
  DISMISSED_NOTIFICATIONS_KEY,
  loadDismissedNotifications,
  saveDismissedNotifications,
} from "@/lib/notification-dismiss";

export type NotificationItem = {
  id: string;
  kind: "announcement" | "activity" | "quiz" | "material" | "message";
  title: string;
  subtitle?: string;
  created_at: string;
  href?: string;
};

type NotificationFeedContextType = {
  items: NotificationItem[];
  visibleItems: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  dismissOne: (id: string) => void;
  clearAll: () => void;
};

const NotificationFeedContext = createContext<NotificationFeedContextType | null>(null);

export function NotificationFeedProvider({ children }: { children: ReactNode }) {
  const { user, roles } = useAuth();
  const { memberSectionIds } = useSectionMembership();
  const isTeacher = roles.includes("teacher");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [teacherSectionIds, setTeacherSectionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissedNotifications);

  useEffect(() => {
    const load = async () => {
      if (!user || !isTeacher) {
        setTeacherSectionIds([]);
        return;
      }
      const [{ data: advisory }, { data: teaching }] = await Promise.all([
        supabase.from("sections").select("id").eq("teacher_id", user.id),
        supabase.from("section_subjects").select("section_id").eq("teacher_id", user.id),
      ]);
      const ids = new Set<string>();
      (advisory || []).forEach((s: { id: string }) => ids.add(s.id));
      (teaching || []).forEach((s: { section_id: string }) => ids.add(s.section_id));
      setTeacherSectionIds([...ids]);
    };
    load();
  }, [user?.id, isTeacher]);

  const mySectionIds = isTeacher ? teacherSectionIds : memberSectionIds;

  const loadFeed = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [ann, act, qz, mat] = await Promise.all([
      supabase.from("announcements").select("id,title,preview_text,created_at").eq("is_active", true).order("created_at", { ascending: false }).limit(5),
      supabase.from("activities").select("id,title,due_date,created_at").eq("is_active", true).order("created_at", { ascending: false }).limit(5),
      supabase.from("quizzes").select("id,title,created_at").eq("is_published", true).order("created_at", { ascending: false }).limit(5),
      supabase.from("materials").select("id,title,created_at").order("created_at", { ascending: false }).limit(5),
    ]);
    const merged: NotificationItem[] = [
      ...((ann.data as any[]) || []).map((a) => ({ id: `ann-${a.id}`, kind: "announcement" as const, title: a.title, subtitle: a.preview_text || undefined, created_at: a.created_at })),
      ...((act.data as any[]) || []).map((a) => ({ id: `act-${a.id}`, kind: "activity" as const, title: a.title, subtitle: a.due_date ? `Due ${new Date(a.due_date).toLocaleDateString()}` : undefined, created_at: a.created_at })),
      ...((qz.data as any[]) || []).map((q) => ({ id: `qz-${q.id}`, kind: "quiz" as const, title: q.title, subtitle: "New quiz published", created_at: q.created_at })),
      ...((mat.data as any[]) || []).map((m) => ({ id: `mat-${m.id}`, kind: "material" as const, title: m.title, subtitle: "New module uploaded", created_at: m.created_at })),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 15);
    setItems(merged);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadFeed();
    if (!user) return;

    const prepend = (n: NotificationItem) => {
      setItems((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev;
        return [n, ...prev]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 15);
      });
      setLoading(false);
    };

    const ch = supabase
      .channel("notif-bell")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, (payload) => {
        const a = payload.new as { id: string; title: string; preview_text?: string; created_at: string; is_active?: boolean };
        if (a.is_active === false) return;
        prepend({ id: `ann-${a.id}`, kind: "announcement", title: a.title, subtitle: a.preview_text || undefined, created_at: a.created_at });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities" }, (payload) => {
        const a = payload.new as { id: string; title: string; due_date?: string; created_at: string; is_active?: boolean };
        if (a.is_active === false) return;
        prepend({ id: `act-${a.id}`, kind: "activity", title: a.title, subtitle: a.due_date ? `Due ${new Date(a.due_date).toLocaleDateString()}` : undefined, created_at: a.created_at });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "quizzes" }, (payload) => {
        const q = payload.new as { id: string; title: string; created_at: string; is_published?: boolean };
        if (q.is_published === false) return;
        prepend({ id: `qz-${q.id}`, kind: "quiz", title: q.title, subtitle: "New quiz published", created_at: q.created_at });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "materials" }, (payload) => {
        const m = payload.new as { id: string; title: string; created_at: string };
        prepend({ id: `mat-${m.id}`, kind: "material", title: m.title, subtitle: "New module uploaded", created_at: m.created_at });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "section_messages" }, async (payload) => {
        const m = payload.new as {
          id: string;
          section_id: string;
          user_id: string;
          recipient_id: string | null;
          reply_to_id: string | null;
          content: string;
          sender_name: string | null;
          created_at: string;
        };
        if (!user || m.user_id === user.id) return;
        if (!mySectionIds.includes(m.section_id)) return;

        let title = m.sender_name?.trim() || "New message";
        let subtitle = m.content.slice(0, 80);
        let href = "/messages";

        if (m.recipient_id === user.id) {
          title = `Private message from ${title}`;
          href = `/messages?section=${m.section_id}&peer=${m.user_id}`;
        } else if (m.reply_to_id) {
          const { data: parent } = await supabase.from("section_messages").select("user_id").eq("id", m.reply_to_id).maybeSingle();
          if (parent?.user_id !== user.id) return;
          title = `${title} replied to you`;
          href = m.recipient_id ? `/messages?section=${m.section_id}&peer=${m.user_id}` : `/messages?section=${m.section_id}`;
        } else if (!m.recipient_id) {
          title = `Section chat: ${title}`;
          href = `/messages?section=${m.section_id}`;
        } else {
          return;
        }

        prepend({ id: `msg-${m.id}`, kind: "message", title, subtitle, created_at: m.created_at, href });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, mySectionIds.join(","), loadFeed]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DISMISSED_NOTIFICATIONS_KEY) {
        setDismissed(loadDismissedNotifications());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const visibleItems = useMemo(() => items.filter((n) => !dismissed.has(n.id)), [items, dismissed]);
  const unreadCount = visibleItems.length;

  const dismissOne = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissedNotifications(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setDismissed((prev) => {
      const next = new Set(prev);
      items.forEach((n) => next.add(n.id));
      saveDismissedNotifications(next);
      return next;
    });
  }, [items]);

  return (
    <NotificationFeedContext.Provider value={{ items, visibleItems, unreadCount, loading, dismissOne, clearAll }}>
      {children}
    </NotificationFeedContext.Provider>
  );
}

export function useNotificationFeed() {
  const ctx = useContext(NotificationFeedContext);
  if (!ctx) {
    return {
      items: [],
      visibleItems: [],
      unreadCount: 0,
      loading: false,
      dismissOne: () => {},
      clearAll: () => {},
    };
  }
  return ctx;
}
