// Máscaras e validações para documentos brasileiros (CNPJ, CPF, CEP)

export function onlyDigits(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

export function maskCnpj(raw: string): string {
  const c = onlyDigits(raw).slice(0, 14);
  if (c.length > 12) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
  if (c.length > 8) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8)}`;
  if (c.length > 5) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5)}`;
  if (c.length > 2) return `${c.slice(0, 2)}.${c.slice(2)}`;
  return c;
}

export function maskCpf(raw: string): string {
  const c = onlyDigits(raw).slice(0, 11);
  if (c.length > 9) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  if (c.length > 6) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6)}`;
  if (c.length > 3) return `${c.slice(0, 3)}.${c.slice(3)}`;
  return c;
}

export function maskCnpjCpf(raw: string): string {
  const c = onlyDigits(raw);
  return c.length > 11 ? maskCnpj(c) : maskCpf(c);
}

export function maskCep(raw: string): string {
  const c = onlyDigits(raw).slice(0, 8);
  if (c.length > 5) return `${c.slice(0, 5)}-${c.slice(5)}`;
  return c;
}

export function isValidCnpj(raw: string): boolean {
  const c = onlyDigits(raw);
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string) => {
    const weights = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split("").reduce((acc, d, i) => acc + parseInt(d, 10) * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(c.slice(0, 12));
  const d2 = calc(c.slice(0, 12) + d1);
  return d1 === parseInt(c[12], 10) && d2 === parseInt(c[13], 10);
}

export function isValidCpf(raw: string): boolean {
  const c = onlyDigits(raw);
  if (c.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(c)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(c[i], 10) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(c[9], 10) && calc(10) === parseInt(c[10], 10);
}
