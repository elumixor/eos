// Client-generated stable IDs for offline-first creates. crypto.randomUUID
// is universally available (HTTPS or localhost only). We don't need cuid
// format — the backend's @id field is just String.
export function newId(): string {
  return crypto.randomUUID();
}
