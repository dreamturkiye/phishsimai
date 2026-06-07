// Stub: Manus Data API removed.
export type DataApiCallOptions = {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
};
export async function callDataApi(_apiId: string, _options: DataApiCallOptions = {}): Promise<unknown> {
  throw new Error("Data API not configured.");
}
