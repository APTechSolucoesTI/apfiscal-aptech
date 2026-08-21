import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/", "/login", "/register", "/forgot-password", "/auth/callback", "/auth/verify-email", "/auth/activate", "/auth/reset-password", "/api/health"];
const SESSION_COOKIE = "apfiscal_session";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  //backend é responsabilidade da API Nest.
  // Não redirecionar chamadas HTTP para /login.
  if (pathname.startsWith("/backend/")) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const hasSession = await validSession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  const isPublic = publicPaths.includes(pathname);

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (
    hasSession &&
    ["/login", "/register", "/forgot-password"].includes(pathname)
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next({ request });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

async function validSession(token?: string) {
  if (!token || !process.env.AUTH_SESSION_SECRET) return false;
  const [header, payload, signature, ...extra] = token.split(".");
  if (!header || !payload || !signature || extra.length) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.AUTH_SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const validSignature = await crypto.subtle.verify("HMAC", key, base64Url(signature), new TextEncoder().encode(`${header}.${payload}`));
  if (!validSignature) return false;
  try {
    const claims = JSON.parse(new TextDecoder().decode(base64Url(payload))) as { app?: string; exp?: number };
    return claims.app === "apfiscal" && typeof claims.exp === "number" && claims.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

function base64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
