// Google Places API (New) text search wrapper used by the @-picker.
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search

const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? "";
const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

export type Place = {
  name: string; // display name
  address: string; // formattedAddress
  lat: number;
  lng: number;
};

let inflight: AbortController | null = null;

// Returns up to 5 places for the typed query. Returns [] on errors / no key /
// empty input. Cancels any previous in-flight call.
export async function searchPlaces(query: string): Promise<Place[]> {
  if (!API_KEY) return [];
  const q = query.trim();
  if (q.length < 2) return [];

  inflight?.abort();
  const ctrl = new AbortController();
  inflight = ctrl;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({ textQuery: q, pageSize: 5 }),
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      places?: {
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
      }[];
    };
    return (data.places ?? [])
      .map((p) => ({
        name: p.displayName?.text ?? "",
        address: p.formattedAddress ?? "",
        lat: p.location?.latitude ?? 0,
        lng: p.location?.longitude ?? 0,
      }))
      .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  } catch {
    return [];
  } finally {
    if (inflight === ctrl) inflight = null;
  }
}

// Build the canonical @place:... token from a Place.
export function placeToken(p: Pick<Place, "name" | "lat" | "lng">): string {
  return `@place:${encodeURIComponent(p.name)}|${p.lat},${p.lng}`;
}

// Google Maps URL that opens the picked spot.
export function placeUrl(name: string, lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=&center=${lat},${lng}`;
}
