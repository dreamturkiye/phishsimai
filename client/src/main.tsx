import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// ARCH-FIX: restore CSS + HealTest v2 harmless comment marker for RETRY_LOOP_TEST_0811
import "./index.css";

// HealTestRetryMarker: RETRY_LOOP_TEST_0811

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);