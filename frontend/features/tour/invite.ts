/**
 * When the invitation to take the guided tour is "live": the top bar's tour pill pulses, and on the
 * empty planner a bubble under it says what the tour is. It is live until this browser has seen a tour
 * start; the bubble also goes once it is dismissed. One store, shared by the top bar (which shows the
 * invitation) and the tour (which says when it starts).
 */

/** Where every "take the tour" link goes: the planner starts the tour when it sees `?tour=1`. */
export const TOUR_HREF = "/?tour=1";

export const SEEN_KEY = "milepost:tour-seen";
export const DISMISSED_KEY = "milepost:tour-invite-dismissed";

// The store's snapshot is these flags in one number, so it is stable between changes.
const SEEN = 1;
const DISMISSED = 2;
const TOURING = 4;
const REQUESTED = 8;

function remembered(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function remember(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Storage blocked (private mode, embedded): the store remembers until the page closes.
  }
}

/** The URL asks for the tour (`?tour=1`): it is about to start. */
const requested = () => new URLSearchParams(window.location.search).get("tour") === "1";

export interface TourInviteStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): number;
  /** Nothing is live on the server: the pill renders static, and the browser decides after hydration. */
  getServerSnapshot(): number;
  /** A tour has started: the invitation has done its job, here and on later visits. */
  tourStarted(): void;
  tourEnded(): void;
  /** The bubble was closed: it stays away; the pill keeps pulsing until a tour has been seen. */
  dismiss(): void;
}

export function createInviteStore(): TourInviteStore {
  // What happened on this page, kept here too in case storage is blocked.
  let seen = false;
  let dismissed = false;
  let touring = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () =>
      (seen || remembered(SEEN_KEY) ? SEEN : 0) |
      (dismissed || remembered(DISMISSED_KEY) ? DISMISSED : 0) |
      (touring ? TOURING : 0) |
      (requested() ? REQUESTED : 0),
    getServerSnapshot: () => SEEN,
    tourStarted() {
      seen = true;
      touring = true;
      remember(SEEN_KEY);
      notify();
    },
    tourEnded() {
      touring = false;
      notify();
    },
    dismiss() {
      dismissed = true;
      remember(DISMISSED_KEY);
      notify();
    },
  };
}

/** The app's invitation store. */
export const tourInvite = createInviteStore();

const INVITING_ROUTE = /^\/(trips\/[^/]+\/?)?$/;

export interface Invitation {
  /** The tour pill pulses. */
  live: boolean;
  /** The bubble under it may show (the empty planner only). */
  bubble: boolean;
}

/** What a page shows, from the store's snapshot: live on `/` and `/trips/[id]`, the bubble on `/` alone. */
export function invitation(snapshot: number, pathname: string | null): Invitation {
  const live =
    pathname !== null && INVITING_ROUTE.test(pathname) && (snapshot & (SEEN | TOURING | REQUESTED)) === 0;
  return { live, bubble: live && pathname === "/" && (snapshot & DISMISSED) === 0 };
}
