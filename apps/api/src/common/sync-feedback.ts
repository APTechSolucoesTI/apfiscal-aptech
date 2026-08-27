import { HttpException, HttpStatus } from "@nestjs/common";

export class ExternalRateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAt: Date,
    readonly source: string,
  ) {
    super(message);
  }
}

export function isSefazConsumptionLimit(message: string): boolean {
  return /consumo\s+indevido|aguardado\s+1\s+hora/i.test(message);
}

export function retryAfterDate(value: string | undefined, fallbackMinutes = 15): Date {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return new Date(Date.now() + seconds * 1000);
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()) && date.getTime() > Date.now()) return date;
  }
  return new Date(Date.now() + fallbackMinutes * 60_000);
}

export function formatRetryAt(retryAt: Date): string {
  return retryAt.toLocaleString("pt-BR");
}

export function cooldownMessage(source: string, retryAt: Date): string {
  const minutes = Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 60_000));
  const hours = Math.ceil(minutes / 60);
  const duration =
    minutes >= 60
      ? `${hours} ${hours === 1 ? "hora" : "horas"}`
      : `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  return `${source} limitou temporariamente as consultas para proteger o CNPJ. Tente novamente em aproximadamente ${duration}, a partir de ${formatRetryAt(retryAt)}. A sincronização automática continuará ativa e retomará sozinha após esse horário.`;
}

export function cooldownException(source: string, retryAt: Date): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      code: "SYNC_COOLDOWN",
      message: cooldownMessage(source, retryAt),
      retryAt: retryAt.toISOString(),
      retryAfterSeconds: Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 1000)),
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

export function friendlyExternalError(source: string, status: number, retryAt?: Date): string {
  if (status === 429 && retryAt) return cooldownMessage(source, retryAt);
  if (status === 401 || status === 403)
    return `${source} recusou o certificado ou a autorização. Confira o certificado A1, a senha e se o CNPJ está autorizado no serviço.`;
  if (status >= 500)
    return `${source} está temporariamente indisponível (HTTP ${status}). A sincronização automática tentará novamente; aguarde alguns minutos antes de uma tentativa manual.`;
  return `${source} não concluiu a consulta (HTTP ${status}). Confira a configuração da empresa e tente novamente mais tarde.`;
}
