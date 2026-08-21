import { BadRequestException } from "@nestjs/common";

export class ProviderPreparationError extends BadRequestException {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options?.cause instanceof Error ? { cause: options.cause } : undefined);
    this.name = "ProviderPreparationError";
  }
}
