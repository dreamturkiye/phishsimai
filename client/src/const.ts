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
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const destination = returnPath
    ? `${window.location.origin}${returnPath}`
    : redirectUri;
  const state = btoa(destination);
  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signUp");
  return url.toString();
};