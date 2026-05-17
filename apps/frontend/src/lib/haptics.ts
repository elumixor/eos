// Thin haptics wrapper. Uses the native Capacitor Haptics engine when running
// inside the iOS shell, and falls back to the Web Vibration API in browsers
// that support it (Android Chrome, some PWAs). On unsupported platforms
// (desktop, iOS Safari) every call is a silent no-op.

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const native = Capacitor.isNativePlatform();

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

/** Light tap — discrete UI feedback (drag pickup, selection). */
export function tapLight() {
  if (native) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  else vibrate(10);
}

/** Medium tap — a committed action (drop, record start/stop). */
export function tapMedium() {
  if (native) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  else vibrate(20);
}

/** Success — task completed. */
export function notifySuccess() {
  if (native) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  else vibrate([15, 40, 15]);
}

/** Warning — destructive action (delete). */
export function notifyWarning() {
  if (native) Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
  else vibrate([30, 30, 30]);
}

/** Open a selection haptic session (call when a drag begins). */
export function selectionStart() {
  if (native) Haptics.selectionStart().catch(() => {});
}

/** Selection change — light flick used while dragging over slots. */
export function selection() {
  // On iOS this only fires feedback when a session was opened via selectionStart().
  if (native) Haptics.selectionChanged().catch(() => {});
  else vibrate(8);
}

/** Close the selection haptic session (call when a drag ends). */
export function selectionEnd() {
  if (native) Haptics.selectionEnd().catch(() => {});
}
