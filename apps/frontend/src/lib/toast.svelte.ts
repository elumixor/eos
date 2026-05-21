// Lightweight ephemeral toast queue. Used for non-intrusive feedback when a
// background mutation (e.g. an optimistic checkbox toggle) fails and the UI
// rolls back — the user needs to know, but a modal is overkill.

export type ToastKind = "error" | "info";
export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

let nextId = 0;

class ToastStore {
  items = $state<Toast[]>([]);
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(message: string, kind: ToastKind = "info", ms = 3000) {
    const id = ++nextId;
    this.items = [...this.items, { id, message, kind }];
    if (ms > 0) this.timers.set(id, setTimeout(() => this.dismiss(id), ms));
    return id;
  }

  error(message: string, ms = 3000) {
    return this.show(message, "error", ms);
  }

  dismiss(id: number) {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new ToastStore();
