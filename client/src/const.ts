export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Login URL — points to the local login page (no external OAuth server).
export const getLoginUrl = (returnPath?: string) => {
  const base = "/login";
  if (returnPath) {
    return `${base}?redirect=${encodeURIComponent(returnPath)}`;
  }
  return base;
};
