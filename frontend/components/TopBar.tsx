import Link from "next/link";
import { TourInvite } from "@/features/tour/TourInvite";
import { HowItWorks } from "./HowItWorks";

const GITHUB_URL = "https://github.com/Dweirii/eld-trip-planner";

/**
 * Brand bar with the product name and help links; hidden when printing. It sits above the page, so the
 * tour invitation's bubble can hang from it over the map.
 */
export function TopBar() {
  return (
    <header className="relative z-40 flex h-12 shrink-0 items-center gap-4 bg-brand px-4 text-white print:hidden">
      <Link href="/" className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight">
        <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
          <circle cx="4" cy="4" r="3.4" fill="#f84960" />
          <circle cx="4" cy="10.5" r="2.6" fill="#008080" />
          <circle cx="11" cy="10.5" r="2.6" fill="#bcddde" />
        </svg>
        Milepost
      </Link>
      <span className="hidden text-xs text-mint/80 sm:inline">ELD trip planner</span>
      <nav className="ml-auto flex items-center gap-3 whitespace-nowrap text-xs font-semibold text-white/80 sm:gap-4">
        {/* The tour link, and on a first visit the invitation to take it (a client component). */}
        <TourInvite />
        <HowItWorks />
        <a href="/api/docs/" target="_blank" rel="noreferrer" className="hover:text-white">
          API docs
        </a>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-white">
          GitHub
        </a>
      </nav>
    </header>
  );
}
