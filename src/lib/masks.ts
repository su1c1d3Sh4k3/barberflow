/**
 * Input masks and formatters for Brazilian data formats.
 */

/** Format phone: +55 (37) 99999-9999 */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 13); // max 13 digits (55 + 11)
  if (digits.length === 0) return "";

  // If starts with 55, format with country code
  let d = digits;
  let hasCountry = false;
  if (d.startsWith("55") && d.length > 2) {
    hasCountry = true;
    d = d.slice(2);
  }

  const prefix = hasCountry ? "+55 " : "";

  if (d.length <= 2) return `${prefix}(${d}`;
  if (d.length <= 7) return `${prefix}(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 11) return `${prefix}(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return `${prefix}(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

/** Extract raw digits from masked phone (with country code 55) */
export function unmaskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  // Ensure it has country code
  if (digits.startsWith("55")) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

/** Format CEP: 00000-000 */
export function maskCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Extract raw digits from CEP */
export function unmaskCep(value: string): string {
  return value.replace(/\D/g, "");
}

/** Format CNPJ: 00.000.000/0001-00 */
export function maskCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/** Brazilian states list */
export const ESTADOS_BR = [
  { uf: "AC", nome: "Acre" },
  { uf: "AL", nome: "Alagoas" },
  { uf: "AP", nome: "Amapá" },
  { uf: "AM", nome: "Amazonas" },
  { uf: "BA", nome: "Bahia" },
  { uf: "CE", nome: "Ceará" },
  { uf: "DF", nome: "Distrito Federal" },
  { uf: "ES", nome: "Espírito Santo" },
  { uf: "GO", nome: "Goiás" },
  { uf: "MA", nome: "Maranhão" },
  { uf: "MT", nome: "Mato Grosso" },
  { uf: "MS", nome: "Mato Grosso do Sul" },
  { uf: "MG", nome: "Minas Gerais" },
  { uf: "PA", nome: "Pará" },
  { uf: "PB", nome: "Paraíba" },
  { uf: "PR", nome: "Paraná" },
  { uf: "PE", nome: "Pernambuco" },
  { uf: "PI", nome: "Piauí" },
  { uf: "RJ", nome: "Rio de Janeiro" },
  { uf: "RN", nome: "Rio Grande do Norte" },
  { uf: "RS", nome: "Rio Grande do Sul" },
  { uf: "RO", nome: "Rondônia" },
  { uf: "RR", nome: "Roraima" },
  { uf: "SC", nome: "Santa Catarina" },
  { uf: "SP", nome: "São Paulo" },
  { uf: "SE", nome: "Sergipe" },
  { uf: "TO", nome: "Tocantins" },
] as const;

/** Fetch address from ViaCEP */
export async function fetchCep(cep: string): Promise<{
  rua: string;
  bairro: string;
  cidade: string;
  estado: string;
} | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;
    return {
      rua: data.logradouro || "",
      bairro: data.bairro || "",
      cidade: data.localidade || "",
      estado: data.uf || "",
    };
  } catch {
    return null;
  }
}
