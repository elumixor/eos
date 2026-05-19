// Tracks which task row currently has its swipe tray open, so opening one row
// snaps every other row shut. Mirrors the shared `dnd` store pattern.

class SwipeOpen {
  id = $state<string | null>(null);
}

export const swipeOpen = new SwipeOpen();
