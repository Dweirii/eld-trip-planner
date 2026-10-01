/** While a shared trip loads (possibly waking the API from a cold start): the workspace, sketched. */
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative h-[calc(100svh-3rem)] min-h-[560px] overflow-hidden bg-[#e8efef]">
        <p role="status" className="sr-only">
          Loading the trip…
        </p>
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 flex max-h-[60%] flex-col gap-3 rounded-t-2xl bg-white p-4 shadow-[0_-6px_24px_rgb(4_59_75/0.18)] motion-safe:animate-pulse lg:inset-x-auto lg:bottom-auto lg:left-4 lg:top-4 lg:w-[340px] lg:rounded-2xl lg:shadow-[0_8px_30px_rgb(4_59_75/0.16)]"
        >
          <div className="h-4 w-3/4 rounded-full bg-[#e3eeee]" />
          <div className="h-3 w-1/2 rounded-full bg-[#eef4f4]" />
          <div className="mt-1 h-14 rounded-xl bg-[#f3f8f8]" />
          <div className="h-8 rounded-full bg-[#eef4f4]" />
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center gap-3">
              <div className="h-3 w-10 rounded-full bg-[#eef4f4]" />
              <div className="h-3 w-3 rounded-full bg-[#e3eeee]" />
              <div className="h-3 flex-1 rounded-full bg-[#eef4f4]" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
