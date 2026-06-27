export const DISMISSED_NOTIFICATIONS_KEY = "icapi_dismissed_notifications";

export function loadDismissedNotifications(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function saveDismissedNotifications(ids: Set<string>) {
  localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify([...ids]));
}
