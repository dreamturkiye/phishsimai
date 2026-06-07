// Cookie options helper — works on both HTTP and HTTPS
export function getSessionCookieOptions(req: any) {
  const proto = (req.headers?.["x-forwarded-proto"] as string) ?? req.protocol ?? "http";
  const isSecure = proto === "https";
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: isSecure,
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
  };
}
