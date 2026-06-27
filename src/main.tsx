import "@fontsource/dm-serif-display/400.css";
import "@fontsource/fira-sans/300.css";
import "@fontsource/fira-sans/400.css";
import "@fontsource/fira-sans/500.css";
import "@fontsource/fira-sans/600.css";
import "@fontsource/fira-sans/700.css";
import "./index.css";
import { initPwaInstallPromptCapture } from "@/lib/pwa-install";

const PWA_CACHE_PREFIX = "bnhs-lms-";

const clearPreviewPwaState = async () => {
  if (!("serviceWorker" in navigator)) return;

  if (import.meta.env.DEV) {
    await Promise.allSettled([
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))),
      "caches" in window
        ? caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(PWA_CACHE_PREFIX)).map((key) => caches.delete(key))))
        : Promise.resolve(),
    ]);
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.update().catch(() => {});
      })
      .catch(() => {});
  });
};

let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());
document.addEventListener("gestureend", (e) => e.preventDefault());

document.addEventListener("wheel", (e) => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });

const bootstrap = async () => {
  initPwaInstallPromptCapture();
  await clearPreviewPwaState();

  const [{ createRoot }, { default: App }] = await Promise.all([
    import("react-dom/client"),
    import("./App.tsx"),
  ]);

  createRoot(document.getElementById("root")!).render(<App />);
};

bootstrap().catch((error) => {
  console.error("Failed to start BNHS LMS", error);
});
