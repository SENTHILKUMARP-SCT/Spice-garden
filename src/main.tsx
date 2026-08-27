import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import AdminDashboard from "./AdminDashboard";

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false } as { hasError: boolean; error?: Error };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("Application error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui",
          background: "#fff",
          color: "#111",
          padding: "30px"
        }}>
          <div style={{ maxWidth: 650 }}>
            <h2>Something went wrong</h2>
            <p>
              This page could not be opened. Check the browser console and make
              sure the backend is running.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "12px 18px",
                background: "#111",
                color: "#fff",
                border: 0,
                borderRadius: 10,
                cursor: "pointer"
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const isAdmin = window.location.pathname.replace(/\/+$/, "") === "/admin";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      {isAdmin ? <AdminDashboard /> : <App />}
    </AppErrorBoundary>
  </React.StrictMode>
);
