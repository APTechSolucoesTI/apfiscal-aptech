import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
  return NextResponse.redirect(new URL(next, request.url));
}
