import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid flex-1 place-items-center p-8">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-extrabold">That trip isn&apos;t here</h1>
        <p className="mt-2 text-sm text-muted">The link may be mistyped, or the trip was never saved.</p>
        <Link href="/" className="mt-5 inline-block rounded-full bg-coral px-5 py-2 text-sm font-bold text-white">
          Plan a new trip
        </Link>
      </div>
    </main>
  );
}
