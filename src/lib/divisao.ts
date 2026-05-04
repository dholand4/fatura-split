import type { Lancamento } from "./parseFatura";

export interface Pessoa {
  id: string;
  nome: string;
  cor: string;
}

export type ModoDivisao = "igual" | "valor" | "percentual";

export interface DivisaoLancamento {
  modo: ModoDivisao;
  // mapa pessoaId -> share (peso para igual, valor em R$ para valor, % para percentual)
  shares: Record<string, number>;
}

export interface DivisaoState {
  // lancamentoId -> DivisaoLancamento
  [lancamentoId: string]: DivisaoLancamento;
}

export function calcularValores(
  lanc: Lancamento,
  divisao: DivisaoLancamento | undefined,
  pessoas: Pessoa[]
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!divisao || pessoas.length === 0) return result;
  const ativas = pessoas.filter(p => divisao.shares[p.id] !== undefined && divisao.shares[p.id] > 0);
  if (ativas.length === 0) return result;
  const valor = Math.abs(lanc.valor);

  if (divisao.modo === "igual") {
    const totalPeso = ativas.reduce((s, p) => s + (divisao.shares[p.id] || 0), 0);
    ativas.forEach(p => {
      result[p.id] = (valor * (divisao.shares[p.id] || 0)) / totalPeso;
    });
  } else if (divisao.modo === "percentual") {
    ativas.forEach(p => {
      result[p.id] = (valor * (divisao.shares[p.id] || 0)) / 100;
    });
  } else {
    ativas.forEach(p => {
      result[p.id] = divisao.shares[p.id] || 0;
    });
  }
  return result;
}

export function validarDivisao(
  lanc: Lancamento,
  divisao: DivisaoLancamento | undefined,
  pessoas: Pessoa[]
): { ok: boolean; soma: number; diff: number } {
  const valores = calcularValores(lanc, divisao, pessoas);
  const soma = Object.values(valores).reduce((s, v) => s + v, 0);
  const total = Math.abs(lanc.valor);
  const diff = total - soma;
  return { ok: Math.abs(diff) < 0.01, soma, diff };
}

export const CORES_PESSOA = [
  "hsl(24 100% 50%)",
  "hsl(200 90% 50%)",
  "hsl(145 65% 42%)",
  "hsl(280 70% 55%)",
  "hsl(38 95% 55%)",
  "hsl(340 80% 55%)",
  "hsl(180 70% 40%)",
  "hsl(260 60% 60%)",
];
