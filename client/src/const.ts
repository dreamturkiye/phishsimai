export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Login URL — points to the local login page (no external OAuth server).
export const getLoginUrl = (returnPath?: string) => {
  const base = "/login";
  if (returnPath) {
    return `${base}?redirect=${encodeURIComponent(returnPath)}`;
  }
  return base;
};

/** Canonical public trial URL with UTM. Organic/SEO pages must use this, not /signup or /pricing. */
export const getTrialUrl = (opts?: {
  source?: string;
  medium?: string;
  campaign?: string;
  returnPath?: string;
}) => {
  const params = new URLSearchParams();
  params.set("utm_source", opts?.source || "seo");
  params.set("utm_medium", opts?.medium || "web");
  params.set("utm_campaign", opts?.campaign || "organic");
  if (opts?.returnPath) params.set("redirect", opts.returnPath);
  return `/trial?${params.toString()}`;
};

export const getSignupUrl = (returnPath?: string) => {
  return getTrialUrl({
    source: "marketing_site",
    medium: "web",
    campaign: "homepage",
    returnPath,
  });
};