"use client";

import NextLink from "next/link";
import { useParams as useNextParams, usePathname, useRouter as useNextRouter, useSearchParams } from "next/navigation";
import type { AnchorHTMLAttributes, ReactNode } from "react";

export function Link({ to, params, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; params?: Record<string, string>; children: ReactNode }) {
  let href = to;
  for (const [param, value] of Object.entries(params ?? {})) href = href.replace(`$${param}`, value);
  return <NextLink href={href} {...props}>{children}</NextLink>;
}

export function useNavigate() {
  const router = useNextRouter();
  return ({ to }: { to: string }) => router.push(to);
}

export function useRouter() {
  const router = useNextRouter();
  return { navigate: ({ to }: { to: string }) => router.push(to), invalidate: () => router.refresh() };
}

export function useRouterState<T>({ select }: { select: (state: { location: { pathname: string } }) => T }): T {
  return select({ location: { pathname: usePathname() } });
}

export function useSearch(_options?: { from?: string }) {
  const params = useSearchParams();
  return { redirect: params.get("redirect") ?? "/dashboard" };
}

export function useParams<T extends Record<string, string>>() {
  return useNextParams<T>();
}
