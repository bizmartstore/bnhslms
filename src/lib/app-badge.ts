const BADGE_MESSAGE = "SET_APP_BADGE";

export function syncAppBadge(count: number) {
  const value = Math.max(0, Math.floor(count));

  if ("setAppBadge" in navigator) {
    if (value > 0) {
      void (navigator as Navigator & { setAppBadge: (n: number) => Promise<void> }).setAppBadge(value);
    } else if ("clearAppBadge" in navigator) {
      void (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
    }
  }

  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.ready.then((registration) => {
      const reg = registration as ServiceWorkerRegistration & {
        setAppBadge?: (n: number) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
      };
      if (value > 0 && reg.setAppBadge) {
        void reg.setAppBadge(value);
      } else if (value === 0 && reg.clearAppBadge) {
        void reg.clearAppBadge();
      } else {
        registration.active?.postMessage({ type: BADGE_MESSAGE, count: value });
      }
    });
  }
}

export function clearAppBadge() {
  syncAppBadge(0);
}

export { BADGE_MESSAGE };
