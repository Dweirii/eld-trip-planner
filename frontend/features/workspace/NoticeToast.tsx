import type { Notice } from "./usePlanner";

export function NoticeToast({ notice, onRetry, onDismiss }: { notice: Notice; onRetry: () => void; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="absolute inset-x-4 bottom-6 z-30 mx-auto flex max-w-md items-start gap-3 rounded-2xl bg-brand p-4 text-sm text-white shadow-xl"
    >
      <p className="flex-1">{notice.message}</p>
      {notice.retry && (
        <button type="button" onClick={onRetry} className="rounded-full bg-coral-ink px-3 py-1 text-xs font-bold">
          Retry
        </button>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-white/70 hover:text-white">
        ×
      </button>
    </div>
  );
}
