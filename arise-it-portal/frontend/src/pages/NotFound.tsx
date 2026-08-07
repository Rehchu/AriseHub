import { Link, useLocation } from "react-router-dom";

// A URL that matches no route used to render nothing at all — an empty #root
// over whatever the theme painted, which on a phone in dark mode is an
// unexplainable black screen. That is how the service worker swallowing
// /api/auth/sso-code presented: the shell booted on a URL it had no route for
// and simply drew nothing.
//
// An unmatched route is now always visible, and says which URL missed, so the
// next routing bug reports itself instead of looking like a crash.
export default function NotFound() {
  const location = useLocation();
  const looksLikeApi = location.pathname.startsWith("/api/");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-ink-900 p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-display font-bold text-brand-600">Page not found</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nothing lives at <code className="font-mono">{location.pathname}</code>.
        </p>
        {looksLikeApi && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            That is an API address. If you were being signed in from AriseHub, the
            sign-in did not complete — reload the page and try again.
          </p>
        )}
        <Link
          to="/"
          className="inline-block bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          Go to the dashboard
        </Link>
      </div>
    </div>
  );
}
