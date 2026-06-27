import { Bell, Megaphone, FileText, ClipboardList, BookOpen, Trash2, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { useNotificationFeed, type NotificationItem } from "@/contexts/NotificationFeedContext";

const iconFor = (k: NotificationItem["kind"]) => {
  switch (k) {
    case "announcement": return <Megaphone className="h-3.5 w-3.5 text-info" />;
    case "activity": return <ClipboardList className="h-3.5 w-3.5 text-destructive" />;
    case "quiz": return <FileText className="h-3.5 w-3.5 text-accent" />;
    case "material": return <BookOpen className="h-3.5 w-3.5 text-success" />;
    case "message": return <MessageSquare className="h-3.5 w-3.5 text-primary" />;
  }
};

const NotificationsPopover = () => {
  const navigate = useNavigate();
  const { items, visibleItems, unreadCount, loading, dismissOne, clearAll } = useNotificationFeed();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-full hover:bg-primary-foreground/10 transition-colors" aria-label="Notifications">
          <Bell className="h-5 w-5 text-primary-foreground" />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5">
              <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[8px] font-extrabold border-0">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[320px] p-0 overflow-hidden">
        <div className="sacred-gradient px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Bell className="h-4 w-4 text-accent shrink-0" />
            <span className="font-serif-display text-sm font-bold text-primary-foreground truncate">Notifications</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-primary-foreground/80">{unreadCount} new</span>
            {items.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] text-primary-foreground hover:bg-primary-foreground/10"
                onClick={clearAll}
              >
                <Trash2 className="h-3 w-3 mr-0.5" /> Clear
              </Button>
            )}
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto divide-y divide-border">
          {loading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Loading…</div>
          ) : visibleItems.length === 0 ? (
            <div className="p-6 text-center">
              <Bell className="h-7 w-7 mx-auto text-muted-foreground/40 mb-1.5" />
              <p className="text-xs text-muted-foreground">
                {items.length > 0 ? "All caught up — check back for new updates" : "No notifications yet"}
              </p>
            </div>
          ) : (
            visibleItems.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  dismissOne(n.id);
                  if (n.href) navigate(n.href);
                }}
                className="w-full px-3 py-2.5 hover:bg-muted/50 transition-colors flex gap-2 group text-left"
              >
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  {iconFor(n.kind)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-foreground truncate">{n.title}</p>
                  {n.subtitle && <p className="text-[10px] text-muted-foreground truncate">{n.subtitle}</p>}
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 self-start transition-opacity"
                  aria-label="Dismiss"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissOne(n.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      dismissOne(n.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationsPopover;
