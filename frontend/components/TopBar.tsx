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
      <nav className="ml-auto flex items-center gap-3 whitespace-nowrap text-xs font-semibold text-white/80 sm:gap-4">
        {/* A plain link: the workspace starts the guided tour when it sees ?tour=1. */}
        {/* Small screens: just the play icon, so the links keep to one line. */}
        <Link
          href="/?tour=1"
          aria-label="Take the tour"
          title="Take the tour"
          className="flex items-center gap-1.5 rounded-full bg-white/10 p-1 text-white transition hover:bg-white/20 sm:pr-2.5"
        >
          <span aria-hidden="true" className="grid size-[18px] place-items-center rounded-full bg-coral-ink">
            <svg viewBox="0 0 10 10" width="8" height="8" className="translate-x-[0.5px]">
              <path d="M2.5 1.4v7.2a.5.5 0 0 0 .76.43l5.6-3.6a.5.5 0 0 0 0-.86l-5.6-3.6a.5.5 0 0 0-.76.43z" fill="#fff" />
            </svg>
          </span>
          <span className="hidden sm:inline">Take the tour</span>
        </Link>
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
