import { type Place, searchPlaces } from "$lib/placeSearch";

// Debounced Google Places lookup. Latest-query-wins; out-of-date responses
// are dropped so a slow flight doesn't clobber what the user is seeing now.
export function createPlaceDebouncer(onResults: (places: Place[], query: string) => void, delay = 200) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = "";
  return {
    schedule(q: string) {
      if (timer) clearTimeout(timer);
      if (q.trim().length < 2) {
        last = q;
        onResults([], q);
        return;
      }
      timer = setTimeout(async () => {
        last = q;
        const results = await searchPlaces(q);
        if (last !== q) return; // user kept typing
        onResults(results, q);
      }, delay);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
