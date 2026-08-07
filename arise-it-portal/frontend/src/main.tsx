import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth-context";
import { ThemeProvider } from "./lib/theme-context";
import { ToastProvider } from "./components/ToastProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import { consumeSsoToken } from "./lib/sso";
import "./index.css";

function mount() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <ToastProvider>
            <BrowserRouter>
              <AuthProvider>
                <App />
              </AuthProvider>
            </BrowserRouter>
          </ToastProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

// If AriseHub handed us a session token, exchange it for a portal cookie BEFORE
// mounting — otherwise the auth check races the exchange and bounces to /login.
consumeSsoToken()
  .catch(() => undefined)
  .finally(mount);
