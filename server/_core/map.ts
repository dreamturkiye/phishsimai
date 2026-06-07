// Stub: Manus Maps proxy removed. Use Google Maps API directly if needed.
export function getMapsConfig() {
  return { apiKey: process.env.GOOGLE_MAPS_API_KEY ?? "" };
}
