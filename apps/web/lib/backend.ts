"use client";

type ErrorPayload = {
  message?: string | string[];
  retryAt?: string;
  code?: string;
};

export async function backendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`/backend${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const payload = (await response.json().catch(() => null)) as T | ErrorPayload | null;

  if (!response.ok) {
    const details = payload as ErrorPayload | null;
    const rawMessage = Array.isArray(details?.message)
      ? details.message.join(" ")
      : details?.message;
    const technical =
      rawMessage &&
      /(schema cache|relation .* does not exist|column .* does not exist|duplicate key|violates .* constraint)/i.test(
        rawMessage,
      );
    const fallback: Record<number, string> = {
      400: "Não foi possível concluir porque algum dado está inválido. Revise os campos e tente novamente.",
      403: "Sua conta não possui permissão ou plano para usar este recurso.",
      404: "O registro solicitado não foi encontrado ou não está mais disponível.",
      409: "Esta operação já está em andamento. Aguarde a conclusão antes de tentar novamente.",
      429: "As consultas foram temporariamente pausadas pelo serviço fiscal. Aguarde o horário informado; a sincronização automática continuará ativa.",
      500: "O sistema não conseguiu concluir esta operação. Tente novamente em alguns minutos; se persistir, consulte os logs de sincronização.",
      503: "Este serviço está temporariamente indisponível. A operação automática tentará novamente quando ele voltar.",
    };
    const error = new Error(
      !technical && rawMessage
        ? rawMessage
        : (fallback[response.status] ??
            "Não foi possível comunicar com o servidor. Verifique sua conexão e tente novamente."),
    );
    Object.assign(error, {
      status: response.status,
      retryAt: details?.retryAt,
      code: details?.code,
    });
    throw error;
  }

  return payload as T;
}
