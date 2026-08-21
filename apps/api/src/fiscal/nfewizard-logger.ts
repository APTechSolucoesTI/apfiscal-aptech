import { logger } from "@nfewizard/shared";

let silenced = false;

/**
 * O NFeWizard registra a configuração completa do certificado, inclusive a
 * senha, durante o carregamento. O logger interno também despeja os metadados
 * no stderr quando nenhum transporte é configurado. Desabilitamos somente o
 * logger da biblioteca; os erros continuam sendo tratados pelo Nest.
 */
export function silenceNfeWizardLogger(): void {
  if (silenced) return;
  logger.info = () => undefined;
  logger.warn = () => undefined;
  logger.error = () => undefined;
  logger.debug = () => undefined;
  logger.http = () => undefined;
  silenced = true;
}
