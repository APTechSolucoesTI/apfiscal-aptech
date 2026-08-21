"use client";

type ActionArgs<TInput> = { data: TInput };

// O retorno flexível existe apenas nesta fronteira HTTP; cada endpoint valida a entrada no Nest.
export function createApiAction<TInput = unknown, TResult = any>(name: string) {
  return async (args?: ActionArgs<TInput>): Promise<TResult> => {
    const response = await fetch(`/backend/actions/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: args?.data }),
      credentials: "same-origin",
    });
    const payload = (await response.json().catch(() => null)) as { data?: TResult; message?: string } | null;
    if (!response.ok) throw new Error(payload?.message ?? "Não foi possível concluir a operação.");
    return payload?.data as TResult;
  };
}

export function useServerFn<TFunction extends (...args: never[]) => unknown>(action: TFunction): TFunction {
  return action;
}
