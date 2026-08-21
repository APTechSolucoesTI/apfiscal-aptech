import { BadGatewayException } from "@nestjs/common";

export class ProviderUnavailableError extends BadGatewayException {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options?.cause instanceof Error ? { cause: options.cause } : undefined);
    this.name = "ProviderUnavailableError";
  }
}
