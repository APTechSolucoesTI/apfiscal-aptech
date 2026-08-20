import type { AppSupabaseClient } from "@/integrations/supabase/client.server";

export type ActionContext = {
  supabase: AppSupabaseClient;
  userId: string;
  claims: Record<string, unknown>;
};

export type RegisteredAction<TInput, TResult> = {
  readonly __apfiscalAction: true;
  execute(data: TInput, context: ActionContext): Promise<TResult>;
};

class ActionBuilder<TInput = undefined> {
  private validator: (data: TInput) => TInput = (data) => data;

  middleware(_middleware: readonly unknown[]): this {
    return this;
  }

  inputValidator<TNext>(validator: (data: TNext) => TNext): ActionBuilder<TNext> {
    const next = new ActionBuilder<TNext>();
    next.validator = validator;
    return next;
  }

  handler<TResult>(handler: (args: { data: TInput; context: ActionContext }) => TResult | Promise<TResult>): RegisteredAction<TInput, TResult> {
    return {
      __apfiscalAction: true,
      execute: async (data, context) => handler({ data: this.validator(data), context }),
    };
  }
}

export function createApiAction(_options: { method: "GET" | "POST" }): ActionBuilder {
  return new ActionBuilder();
}

export function isRegisteredAction(value: unknown): value is RegisteredAction<unknown, unknown> {
  return Boolean(value && typeof value === "object" && (value as { __apfiscalAction?: boolean }).__apfiscalAction);
}
