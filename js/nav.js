// Navigation state shared by the shell and the views (kept separate to avoid import cycles).
let dirtyFn = null;

/** A view registers a function that returns true when it has unsaved changes. */
export function setDirtyGuard(fn) { dirtyFn = fn; }
export function isDirty() { return !!dirtyFn?.(); }
export function clearDirty() { dirtyFn = null; }

/** Go to a hash route. force=true skips the unsaved-changes question (e.g. right after saving). */
export function navigate(hash, { force = false } = {}) {
  if (force) dirtyFn = null;
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
