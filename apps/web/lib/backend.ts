"use client";

export async function backendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`/backend${path}`, { ...init, headers, credentials: "same-origin" });
  const payload = (await response.json().catch(() => null)) as T | { message?: string } | null;
  if (!response.ok) throw new Error((payload as { message?: string } | null)?.message ?? "Falha na comunicação com a API.");
  return payload as T;
}
