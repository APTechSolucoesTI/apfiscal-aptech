export function nfeWizardFiscalRejection(detail: string): string | null {
  const match = detail.match(/NFE_RecepcaoEvento:\s*(?:Rejei(?:ç|c)(?:ã|a)o:\s*)?(.+)/i);
  if (!match) return null;

  const reason = match[1]?.trim();
  if (!reason) return null;
  if (/apresentado ap[oó]s o prazo permitido/i.test(reason)) {
    const deadline = reason.match(/\[([^\]]+)\]/)?.[1] ?? "prazo informado pela SEFAZ";
    return `A SEFAZ recusou esta manifestação porque o prazo fiscal permitido já expirou (${deadline}). Esta NF-e não pode mais ser manifestada; selecione uma nota dentro do prazo.`;
  }
  return `A SEFAZ recusou a manifestação: ${reason}`;
}
