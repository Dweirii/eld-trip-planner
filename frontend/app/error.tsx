"use client"; // Error boundaries must be Client Components.

import Link from "next/link";

/**
 * Shown when a page fails to render, e.g. the trip API timed out while waking from a cold start.
 * `retry` (Next 16.3) re-fetches the server content and re-renders; `reset` would only re-render.
 */
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void; reset: () => void }) {
  return (
    <main className="grid flex-1 place-items-center p-8">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-extrabold">Something went wrong loading this page</h1>
        <p className="mt-2 text-sm text-muted">
          The trip service may be waking up, which can take a few seconds. Please try again.
        </p>
        <div className="mt-5 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-full bg-coral-ink px-5 py-2 text-sm font-bold text-white"
          >
            Try again
          </button>
          <Link href="/" className="text-sm font-bold text-brand underline-offset-4 hover:underline">
            Plan a new trip
          </Link>
        </div>
      </div>
    </main>
  );
}
