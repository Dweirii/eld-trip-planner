import Link from "next/link";
import { HowItWorks } from "./HowItWorks";

const GITHUB_URL = "https://github.com/Dweirii/eld-trip-planner";

/** Brand bar with the product name and help links; hidden when printing. */
export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 bg-brand px-4 text-white print:hidden">
      <Link href="/" className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight">
        <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
          <circle cx="4" cy="4" r="3.4" fill="#f84960" />
          <circle cx="4" cy="10.5" r="2.6" fill="#008080" />
          <circle cx="11" cy="10.5" r="2.6" fill="#bcddde" />
        </svg>
        Milepost
      </Link>
      <span className="hidden text-xs text-mint/80 sm:inline">ELD trip planner</span>
      <nav className="ml-auto flex items-center gap-4 text-xs font-semibold text-white/80">
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
