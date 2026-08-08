"use client";

import * as Sentry from "@sentry/react";

// Catches errors in the root layout itself (the one place `[locale]/error.tsx`
// can't reach). Must render its own <html>/<body> since it replaces the root
// layout, so no next-intl/i18n here.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  Sentry.captureException(error);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold text-gray-900">
            Something went wrong
          </h1>
          <button
            type="button"
            onClick={reset}
            className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
