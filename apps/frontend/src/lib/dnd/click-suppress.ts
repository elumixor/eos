// iOS and some Androids fire a synthetic `click` on pointerup. That click
// would land on whatever is under the finger at release and could (e.g.)
// put a task into edit mode. Suppress on any real drag so the click-through
// bug can't slip through. 300ms covers Android's legacy synthetic-click
// delay; missing one stray tap is preferable to letting the bug back in.
export function suppressNextClick() {
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    window.removeEventListener("click", swallow, true);
  };
  window.addEventListener("click", swallow, true);
  setTimeout(() => window.removeEventListener("click", swallow, true), 300);
}
