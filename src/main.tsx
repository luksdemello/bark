import React from "react";
import ReactDOM from "react-dom/client";
import { error } from "@tauri-apps/plugin-log";
import App from "./App";

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error
    ? `${event.reason.message}\n${event.reason.stack ?? ""}`
    : String(event.reason);
  error(`Unhandled promise rejection: ${reason}`).catch(() => {});
});

window.onerror = (_message, source, lineno, colno, err) => {
  const detail = err?.stack ?? `${_message} at ${source}:${lineno}:${colno}`;
  error(`Global error: ${detail}`).catch(() => {});
  return false;
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
