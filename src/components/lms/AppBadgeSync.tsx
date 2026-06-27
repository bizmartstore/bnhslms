import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationFeed } from "@/contexts/NotificationFeedContext";
import { useUnreadMessagesContext } from "@/contexts/UnreadMessagesContext";
import { usePendingBadges } from "@/hooks/usePendingBadges";
import { clearAppBadge, syncAppBadge } from "@/lib/app-badge";

/** Syncs unread counts to the installed PWA home-screen icon badge (Badging API). */
const AppBadgeSync = () => {
  const { user, profile, roles } = useAuth();
  const { totalUnread } = useUnreadMessagesContext();
  const { visibleItems } = useNotificationFeed();
  const { sectionJoinRequests, studentApprovals, adminApprovals } = usePendingBadges();

  const approved = profile?.approval_status === "approved";
  const isTeacher = roles.includes("teacher");
  const isAdmin = roles.includes("admin");

  const feedCount = visibleItems.filter((n) => n.kind !== "message").length;
  const pendingCount = isAdmin
    ? adminApprovals + (isTeacher ? sectionJoinRequests : 0)
    : isTeacher
      ? sectionJoinRequests + studentApprovals
      : 0;

  const badgeTotal = user && approved ? totalUnread + feedCount + pendingCount : 0;

  useEffect(() => {
    if (!user || !approved) {
      clearAppBadge();
      return;
    }
    syncAppBadge(badgeTotal);
  }, [user, approved, badgeTotal]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && user && approved) {
        syncAppBadge(badgeTotal);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [user, approved, badgeTotal]);

  useEffect(() => {
    if (!user) clearAppBadge();
  }, [user]);

  return null;
};

export default AppBadgeSync;
