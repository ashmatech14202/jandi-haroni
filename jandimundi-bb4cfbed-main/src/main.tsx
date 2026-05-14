import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Hide the in-app splash screen after the app mounts
window.setTimeout(() => {
  const splash = document.getElementById("app-splash");
  if (splash) {
    splash.classList.add("fade-out");
    window.setTimeout(() => splash.remove(), 600);
  }
}, 1200);

// Guard: don't register service worker in Lovable preview or iframes
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (!isPreviewHost && !isInIframe && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("ServiceWorker registration successful");
      })
      .catch((error) => {
        console.log("ServiceWorker registration failed:", error);
      });
  });
}
