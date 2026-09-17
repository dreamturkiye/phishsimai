export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Login URL — points to the local login page (no external OAuth server).
export const getLoginUrl = (returnPath?: string) => {
  const base = "/login";
  if (returnPath) {
    return `${base}?redirect=${encodeURIComponent(returnPath)}`;
  }
  return base;
};

export const getSignupUrl = (returnPath?: string) => {
  const params = new URLSearchParams();
  params.set("utm_source", "marketing_site");
  params.set("utm_medium", "web");
  params.set("utm_campaign", "homepage");
  if (returnPath) params.set("redirect", returnPath);
  return `/trial?${params.toString()}`;
};