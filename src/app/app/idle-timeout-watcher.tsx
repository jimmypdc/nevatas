"use client";

// Browser-side idle countdown. Forces sign-out after the configured idle
// window of no user input. Independent of (and stricter than) the JWT
// max-age — a user who walks away from their desk gets logged out within
// minutes, regardless of how long the JWT has left to live.
//
// Activity sources we count: pointer move, pointer down, key down, scroll,
// touch start, visibility change. The pointermove listener is throttled to
// once per second so it doesn't bloat React state churn.
//
// In the last `warningSeconds` before the deadline, a modal counts down and
// offers a "Stay signed in" button that resets the timer + pings the
// server (any authenticated request triggers NextAuth's updateAge refresh).

import { signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

export type IdleTimeoutWatcherProps = {
  idleTimeoutMinutes: number;
  warningSeconds: number;
};

const WINDOW_ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "pointerdown",
  "pointermove",
  "keydown",
  "scroll",
  "touchstart",
];

// `visibilitychange` is a Document-only event; listen separately so the
// keyof WindowEventMap typing above stays accurate.
const DOCUMENT_ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = [
  "visibilitychange",
];

const POINTERMOVE_THROTTLE_MS = 1000;

export function IdleTimeoutWatcher({ idleTimeoutMinutes, warningSeconds }: IdleTimeoutWatcherProps) {
  const idleMs = idleTimeoutMinutes * 60_000;
  const warningMs = warningSeconds * 1000;
  if (warningMs >= idleMs) {
    // Shouldn't happen with sane env config; render nothing rather than
    // permanently displaying the warning modal.
    return null;
  }

  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const lastActivity = useRef<number>(Date.now());
  const lastPointerMoveRecorded = useRef<number>(0);
  const tickHandle = useRef<ReturnType<typeof setInterval> | null>(null);

  const stayActive = useCallback(() => {
    lastActivity.current = Date.now();
    setSecondsRemaining(null);
    // Nudge the server: any authenticated request re-mints the JWT if
    // updateAge has elapsed. Doesn't matter if this races; worst case we
    // re-fetch in 30s on the next idle check.
    fetch("/api/me", { credentials: "include" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    function onActivity(e: Event) {
      const now = Date.now();
      // Throttle pointermove specifically — every other event is rare
      // enough to record on every tick.
      if (e.type === "pointermove") {
        if (now - lastPointerMoveRecorded.current < POINTERMOVE_THROTTLE_MS) return;
        lastPointerMoveRecorded.current = now;
      }
      lastActivity.current = now;
      // If the warning was visible, dismiss it on any real activity.
      setSecondsRemaining((curr) => (curr === null ? curr : null));
    }

    for (const ev of WINDOW_ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    for (const ev of DOCUMENT_ACTIVITY_EVENTS) {
      document.addEventListener(ev, onActivity, { passive: true });
    }
    return () => {
      for (const ev of WINDOW_ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      for (const ev of DOCUMENT_ACTIVITY_EVENTS) {
        document.removeEventListener(ev, onActivity);
      }
    };
  }, []);

  useEffect(() => {
    function tick() {
      const elapsed = Date.now() - lastActivity.current;
      const msToDeadline = idleMs - elapsed;
      if (msToDeadline <= 0) {
        if (tickHandle.current) clearInterval(tickHandle.current);
        signOut({ callbackUrl: "/login?reason=idle" }).catch(() => undefined);
        return;
      }
      if (msToDeadline <= warningMs) {
        setSecondsRemaining(Math.ceil(msToDeadline / 1000));
      } else if (secondsRemaining !== null) {
        setSecondsRemaining(null);
      }
    }

    tickHandle.current = setInterval(tick, 1000);
    return () => {
      if (tickHandle.current) clearInterval(tickHandle.current);
    };
    // secondsRemaining intentionally omitted from deps — tick reads via ref
  }, [idleMs, warningMs, secondsRemaining]);

  if (secondsRemaining === null) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-warning-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 id="idle-warning-title" className="text-base font-semibold">
          Still there?
        </h2>
        <p className="mt-2 text-sm text-subtle">
          You&apos;ll be signed out in <strong>{secondsRemaining}</strong> second{secondsRemaining === 1 ? "" : "s"} due to inactivity.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={stayActive}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg"
          >
            Stay signed in
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/login?reason=signed_out" })}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-muted"
          >
            Sign out now
          </button>
        </div>
      </div>
    </div>
  );
}
