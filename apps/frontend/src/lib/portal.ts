// Svelte action that moves its element to document.body, escaping any
// ancestor with `transform` / `filter` / `backdrop-filter` that would
// otherwise scope our `fixed` positioning to that ancestor.
export function portal(node: HTMLElement) {
  const target = document.body;
  target.appendChild(node);
  return {
    destroy() {
      node.parentNode?.removeChild(node);
    },
  };
}
