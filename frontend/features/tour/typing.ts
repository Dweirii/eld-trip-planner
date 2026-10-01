/** The tour's typing animation: a value appears one character at a time, at a person's pace. */

/** Milliseconds per character. */
export const TYPE_DELAY = 80;
/** After a comma the next keystroke comes this much later, like a person reaching for the state. */
const COMMA_PAUSE = 2;

function delayBefore(text: string, index: number): number {
  return text[index - 1] === "," ? TYPE_DELAY * COMMA_PAUSE : TYPE_DELAY;
}

/** How long typing `text` takes. */
export function typingTime(text: string): number {
  let total = 0;
  for (let index = 0; index < text.length; index++) total += delayBefore(text, index);
  return total;
}

export interface TypeTextOptions {
  text: string;
  /** Called with the text typed so far, after each keystroke. */
  onType: (typed: string) => void;
  /** A wait that pauses and aborts with the tour (StepContext.wait). */
  wait: (ms: number) => Promise<void>;
  /** Show the whole text at once, then let the same time pass, so the tour keeps its pace. */
  reducedMotion?: boolean;
}

/** Types `text`; rejects (and stops typing) when its wait is aborted. */
export async function typeText({ text, onType, wait, reducedMotion = false }: TypeTextOptions): Promise<void> {
  if (reducedMotion) {
    onType(text);
    await wait(typingTime(text));
    return;
  }
  for (let index = 0; index < text.length; index++) {
    await wait(delayBefore(text, index));
    onType(text.slice(0, index + 1));
  }
}
