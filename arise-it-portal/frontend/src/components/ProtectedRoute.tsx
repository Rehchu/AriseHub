import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  // First-login users must set a password on /profile. Redirect them there —
  // but NOT when they're already on /profile, or the guard would loop forever
  // (blank screen), since /profile is itself behind this guard.
  if (user.mustChangePassword && location.pathname !== "/profile") {
    return <Navigate to="/profile?forcePasswordChange=1" replace />;
  }
  return <>{children}</>;
}
