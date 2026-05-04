import type { LocalProfileConfig } from "@/constants/appProfiles";
import type { Pessoa } from "@/lib/divisao";
import type { FaturaResumo, Lancamento } from "@/lib/parseFatura";

export interface AppState {
  fatura: FaturaResumo | null;
  pessoas: Pessoa[];
  atribuicoes: Record<string, Record<string, number>>;
  faturaAnterior: FaturaResumo | null;
  atribuicoesFaturaAnterior: Record<string, Record<string, number>>;
}

export const fmt = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const normalizarNome = (nome: string) => nome.trim().toLocaleLowerCase("pt-BR");
export const ehLancamentoNegativo = (lancamento: Lancamento) => lancamento.valor < 0;
export const arredondarCentavos = (valor: number) => Math.round(valor * 100) / 100;

export const parseValorInput = (valor: string) => {
  const numero = Number(valor.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
};

export const somarAtribuicao = (atribuicao: Record<string, number> = {}) =>
  Object.values(atribuicao).reduce((soma, valor) => soma + valor, 0);

export const createEmptyState = (): AppState => ({
  fatura: null,
  pessoas: [],
  atribuicoes: {},
  faturaAnterior: null,
  atribuicoesFaturaAnterior: {},
});

const ordenarPessoas = (pessoas: Pessoa[]) =>
  [...pessoas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

const normalizarDescricaoLancamento = (descricao: string) =>
  descricao
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const limitarValorDivisao = (
  lancamento: Lancamento,
  atribuicao: Record<string, number>,
  pessoaId: string,
  valorDigitado: string
) => {
  const valorLancamento = Math.max(0, lancamento.valor);
  const totalOutrasPessoas = Object.entries(atribuicao)
    .filter(([idPessoa]) => idPessoa !== pessoaId)
    .reduce((total, [, valor]) => total + valor, 0);
  const restante = Math.max(0, arredondarCentavos(valorLancamento - totalOutrasPessoas));
  const valorSeguro = Math.min(Math.max(0, parseValorInput(valorDigitado)), restante);
  return arredondarCentavos(valorSeguro);
};

export function importarParceladasDaFaturaAnterior(
  faturaAnterior: FaturaResumo | null,
  atribuicoesAnteriores: Record<string, Record<string, number>>,
  novaFatura: FaturaResumo
) {
  if (!faturaAnterior) return {};

  const importadas: Record<string, Record<string, number>> = {};

  novaFatura.lancamentos.forEach(novoLancamento => {
    if (
      !novoLancamento.parcelaAtual ||
      !novoLancamento.parcelaTotal ||
      novoLancamento.parcelaAtual <= 1 ||
      ehLancamentoNegativo(novoLancamento)
    ) {
      return;
    }

    const candidatos = faturaAnterior.lancamentos.filter(lancamentoAnterior => {
      if (!lancamentoAnterior.parcelaAtual || !lancamentoAnterior.parcelaTotal) return false;
      if (ehLancamentoNegativo(lancamentoAnterior)) return false;

      const mesmaDescricao =
        normalizarDescricaoLancamento(lancamentoAnterior.descricao) ===
        normalizarDescricaoLancamento(novoLancamento.descricao);
      const mesmoTotalParcelas = lancamentoAnterior.parcelaTotal === novoLancamento.parcelaTotal;
      const parcelaSeguinte = lancamentoAnterior.parcelaAtual + 1 === novoLancamento.parcelaAtual;
      const mesmoValor = arredondarCentavos(lancamentoAnterior.valor) === arredondarCentavos(novoLancamento.valor);

      return mesmaDescricao && mesmoTotalParcelas && parcelaSeguinte && mesmoValor;
    });

    if (candidatos.length !== 1) return;

    const atribuicaoAnterior = atribuicoesAnteriores[candidatos[0].id];
    if (!atribuicaoAnterior || Object.keys(atribuicaoAnterior).length === 0) return;

    importadas[novoLancamento.id] = { ...atribuicaoAnterior };
  });

  return importadas;
}

function prepararPessoas(
  pessoas: Pessoa[] = [],
  profile: LocalProfileConfig,
  incluirPadroesQuandoVazio = true
) {
  const pessoasPadrao = profile.initialPeople;
  const existentes = pessoas.length || !incluirPadroesQuandoVazio ? [...pessoas] : [...pessoasPadrao];
  const idMap: Record<string, string> = {};

  pessoasPadrao.forEach(pessoaPadrao => {
    const index = existentes.findIndex(p => normalizarNome(p.nome) === normalizarNome(pessoaPadrao.nome));
    if (index >= 0) {
      if (existentes[index].id !== pessoaPadrao.id) idMap[existentes[index].id] = pessoaPadrao.id;
      existentes[index] = {
        ...existentes[index],
        id: pessoaPadrao.id,
        cor: existentes[index].cor || pessoaPadrao.cor,
      };
    } else if (incluirPadroesQuandoVazio) {
      existentes.push(pessoaPadrao);
    }
  });

  return { pessoas: ordenarPessoas(existentes), idMap };
}

function encontrarResponsavelNegativos(pessoas: Pessoa[], profile: LocalProfileConfig) {
  return pessoas.find(pessoa => pessoa.id === profile.negativeOwnerId) ?? pessoas[0] ?? null;
}

export function atribuirNegativos(
  lancamentos: Lancamento[] = [],
  pessoas: Pessoa[],
  atribuicoes: Record<string, Record<string, number>> = {},
  profile: LocalProfileConfig
) {
  const novasAtribuicoes = { ...atribuicoes };
  const responsavel = encontrarResponsavelNegativos(pessoas, profile);
  if (!responsavel) return novasAtribuicoes;

  lancamentos.forEach(lancamento => {
    if (ehLancamentoNegativo(lancamento)) {
      novasAtribuicoes[lancamento.id] = { [responsavel.id]: lancamento.valor };
    }
  });

  return novasAtribuicoes;
}

export function prepararEstado(state: AppState, profile: LocalProfileConfig): AppState {
  const { pessoas, idMap } = prepararPessoas(state.pessoas, profile);
  const lancamentosPorId = new Map((state.fatura?.lancamentos || []).map(lancamento => [lancamento.id, lancamento]));
  const atribuicoesMigradas: Record<string, Record<string, number>> = {};

  Object.entries((state.atribuicoes || {}) as Record<string, unknown>).forEach(([lancamentoId, atribuicao]) => {
    const lancamento = lancamentosPorId.get(lancamentoId);
    if (typeof atribuicao === "string") {
      const pessoaId = idMap[atribuicao] ?? atribuicao;
      atribuicoesMigradas[lancamentoId] = { [pessoaId]: lancamento?.valor ?? 0 };
      return;
    }

    atribuicoesMigradas[lancamentoId] = Object.fromEntries(
      Object.entries((atribuicao || {}) as Record<string, unknown>)
        .map(([pessoaId, valor]) => [idMap[pessoaId] ?? pessoaId, valor])
        .filter(([, valor]) => typeof valor === "number" && Number.isFinite(valor) && valor !== 0)
    );
  });

  return {
    ...state,
    pessoas,
    atribuicoes: atribuirNegativos(state.fatura?.lancamentos, pessoas, atribuicoesMigradas, profile),
    faturaAnterior: state.faturaAnterior ?? null,
    atribuicoesFaturaAnterior: state.atribuicoesFaturaAnterior ?? {},
  };
}

export function carregarEstadoInicial(profile: LocalProfileConfig): AppState {
  try {
    const raw = localStorage.getItem(profile.storageKey);
    return prepararEstado(raw ? (JSON.parse(raw) as AppState) : createEmptyState(), profile);
  } catch {
    return prepararEstado(createEmptyState(), profile);
  }
}

export function persistirEstado(profile: LocalProfileConfig, state: AppState) {
  localStorage.setItem(profile.storageKey, JSON.stringify(state));
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Erro inesperado.";
}
