import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, FileText, LogOut, Plus, Printer, Upload, Users, X } from "lucide-react";
import { PROFILE_CONFIGS, clearStoredProfileMode, getStoredProfileMode } from "@/constants/appProfiles";
import { CORES_PESSOA } from "@/lib/divisao";
import { parseFaturaFromFile } from "@/lib/parseFatura";
import {
  arredondarCentavos,
  atribuirNegativos,
  carregarEstadoInicial,
  ehLancamentoNegativo,
  fmt,
  getErrorMessage,
  importarParceladasDaFaturaAnterior,
  limitarValorDivisao,
  normalizarNome,
  parseValorInput,
  persistirEstado,
  prepararEstado,
  somarAtribuicao,
  type AppState,
} from "@/utils/faturaState";

interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  variant?: "default" | "destructive";
}

export default function HomePage() {
  const navigate = useNavigate();
  const activeProfile = getStoredProfileMode();
  const profileConfig = activeProfile ? PROFILE_CONFIGS[activeProfile] : null;
  const [state, setState] = useState<AppState>(() =>
    profileConfig ? carregarEstadoInicial(profileConfig) : { fatura: null, pessoas: [], atribuicoes: {}, faturaAnterior: null, atribuicoesFaturaAnterior: {} }
  );
  const [loading, setLoading] = useState(false);
  const [novaPessoa, setNovaPessoa] = useState("");
  const [lancamentoDividindoId, setLancamentoDividindoId] = useState<string | null>(null);
  const [divisaoRascunho, setDivisaoRascunho] = useState<Record<string, number>>({});
  const [pessoaParaAdicionarId, setPessoaParaAdicionarId] = useState("");
  const [valorParaAdicionar, setValorParaAdicionar] = useState("");
  const [filtroDivisao, setFiltroDivisao] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: "",
    description: "",
    confirmLabel: "Confirmar",
    cancelLabel: "Cancelar",
    variant: "default",
  });
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    if (!profileConfig) return;
    persistirEstado(profileConfig, state);
  }, [profileConfig, state]);

  if (!profileConfig) {
    return <Navigate to="/login" replace />;
  }

  const pedirConfirmacao = (options: Omit<ConfirmDialogState, "open">) =>
    new Promise<boolean>(resolve => {
      confirmResolverRef.current = resolve;
      setConfirmDialog({ open: true, ...options });
    });

  const responderConfirmacao = (confirmado: boolean) => {
    confirmResolverRef.current?.(confirmado);
    confirmResolverRef.current = null;
    setConfirmDialog(currentState => ({ ...currentState, open: false }));
  };

  const sairDoPerfil = () => {
    clearStoredProfileMode();
    toast.info("Voce saiu deste acesso. Os dados locais desse perfil foram mantidos.");
    navigate("/login", { replace: true });
  };

  const handleUpload = async (file: File) => {
    setLoading(true);
    try {
      const faturaAnterior = state.fatura ?? state.faturaAnterior;
      const atribuicoesAnteriores = state.fatura ? state.atribuicoes : state.atribuicoesFaturaAnterior;
      const fatura = await parseFaturaFromFile(file);
      let atribuicoesImportadas: Record<string, Record<string, number>> = {};

      if (faturaAnterior) {
        const desejaImportar = await pedirConfirmacao({
          title: "Importar parceladas",
          description: "Vamos reaplicar apenas compras parceladas que continuaram claramente da fatura anterior para esta nova fatura.",
          confirmLabel: "Importar",
          cancelLabel: "Comecar do zero",
          variant: "default",
        });

        if (desejaImportar) {
          atribuicoesImportadas = importarParceladasDaFaturaAnterior(faturaAnterior, atribuicoesAnteriores, fatura);
        }
      }

      setState(currentState =>
        prepararEstado(
          {
            ...currentState,
            fatura,
            atribuicoes: atribuirNegativos(fatura.lancamentos, currentState.pessoas, atribuicoesImportadas, profileConfig),
            faturaAnterior: null,
            atribuicoesFaturaAnterior: {},
          },
          profileConfig
        )
      );

      toast.success(`${fatura.lancamentos.length} lancamentos encontrados`);
      if (Object.keys(atribuicoesImportadas).length > 0) {
        toast.info(`${Object.keys(atribuicoesImportadas).length} compra(s) parcelada(s) importada(s) da fatura anterior.`);
      }
    } catch (error: unknown) {
      toast.error(`Falha ao ler PDF: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const addPessoa = () => {
    const nome = novaPessoa.trim();
    if (!nome) return;
    if (state.pessoas.some(pessoa => normalizarNome(pessoa.nome) === normalizarNome(nome))) {
      toast.info("Essa pessoa ja esta cadastrada.");
      return;
    }

    const cor = CORES_PESSOA[state.pessoas.length % CORES_PESSOA.length];
    setState(currentState =>
      prepararEstado(
        {
          ...currentState,
          pessoas: [...currentState.pessoas, { id: crypto.randomUUID(), nome, cor }],
        },
        profileConfig
      )
    );
    setNovaPessoa("");
  };

  const removePessoa = async (id: string) => {
    const pessoa = state.pessoas.find(item => item.id === id);
    const confirmado = await pedirConfirmacao({
      title: "Remover pessoa",
      description: `Vamos remover ${pessoa?.nome || "esta pessoa"} e apagar as atribuicoes ligadas a ela nesta fatura.`,
      confirmLabel: "Remover",
      cancelLabel: "Cancelar",
      variant: "destructive",
    });
    if (!confirmado) return;

    setState(currentState => {
      const novaAtr = { ...currentState.atribuicoes };
      Object.keys(novaAtr).forEach(lancamentoId => {
        if (novaAtr[lancamentoId]) delete novaAtr[lancamentoId][id];
        if (novaAtr[lancamentoId] && Object.keys(novaAtr[lancamentoId]).length === 0) delete novaAtr[lancamentoId];
      });

      return prepararEstado(
        {
          ...currentState,
          pessoas: currentState.pessoas.filter(pessoaAtual => pessoaAtual.id !== id),
          atribuicoes: novaAtr,
        },
        profileConfig
      );
    });
  };

  const lancs = state.fatura?.lancamentos || [];

  const setValorDivisaoRascunho = (pessoaId: string, valorDigitado: string) => {
    if (!lancamentoDividindoId) return;
    const lancamento = lancs.find(item => item.id === lancamentoDividindoId);
    if (!lancamento) return;

    setDivisaoRascunho(rascunhoAtual => {
      const novoRascunho = { ...rascunhoAtual };
      const valorFinal = limitarValorDivisao(lancamento, novoRascunho, pessoaId, valorDigitado);

      if (valorFinal <= 0) delete novoRascunho[pessoaId];
      else novoRascunho[pessoaId] = valorFinal;

      return novoRascunho;
    });
  };

  const removerPessoaDivisao = (pessoaId: string) => {
    setDivisaoRascunho(rascunhoAtual => {
      const novoRascunho = { ...rascunhoAtual };
      delete novoRascunho[pessoaId];
      return novoRascunho;
    });
  };

  const abrirDivisao = (lancId: string) => {
    const atribuicao = state.atribuicoes[lancId] || {};
    const primeiraPessoaLivre = state.pessoas.find(pessoa => atribuicao[pessoa.id] === undefined);
    setDivisaoRascunho({ ...atribuicao });
    setPessoaParaAdicionarId(primeiraPessoaLivre?.id || "");
    setValorParaAdicionar("");
    setFiltroDivisao("");
    setLancamentoDividindoId(lancId);
  };

  const adicionarPessoaDivisao = () => {
    if (!lancamentoDividindoId || !pessoaParaAdicionarId) return;

    const lancamento = lancs.find(item => item.id === lancamentoDividindoId);
    if (!lancamento) return;

    const restante = Math.max(0, arredondarCentavos(lancamento.valor - somarAtribuicao(divisaoRascunho)));
    const valor = valorParaAdicionar.trim() ? parseValorInput(valorParaAdicionar) : restante;
    const novoRascunho = { ...divisaoRascunho };
    const valorFinal = limitarValorDivisao(lancamento, novoRascunho, pessoaParaAdicionarId, String(valor));
    if (valorFinal > 0) novoRascunho[pessoaParaAdicionarId] = valorFinal;

    setDivisaoRascunho(novoRascunho);
    const proximaPessoaLivre = state.pessoas.find(
      pessoa => pessoa.id !== pessoaParaAdicionarId && novoRascunho[pessoa.id] === undefined
    );
    setPessoaParaAdicionarId(proximaPessoaLivre?.id || "");
    setValorParaAdicionar("");
  };

  const fecharDivisaoSemSalvar = () => {
    setLancamentoDividindoId(null);
    setDivisaoRascunho({});
    setPessoaParaAdicionarId("");
    setValorParaAdicionar("");
    setFiltroDivisao("");
  };

  const salvarDivisao = () => {
    if (!lancamentoDividindoId) return;
    const divisaoLimpa = Object.fromEntries(Object.entries(divisaoRascunho).filter(([, valor]) => valor > 0));

    setState(currentState => {
      const novo = { ...currentState.atribuicoes };
      if (Object.keys(divisaoLimpa).length === 0) delete novo[lancamentoDividindoId];
      else novo[lancamentoDividindoId] = divisaoLimpa;
      return { ...currentState, atribuicoes: novo };
    });
    fecharDivisaoSemSalvar();
  };

  const reset = async () => {
    const confirmado = await pedirConfirmacao({
      title: "Nova fatura",
      description: "A fatura atual vai sair da tela e ficar guardada como referencia para importar parceladas na proxima.",
      confirmLabel: "Continuar",
      cancelLabel: "Cancelar",
      variant: "default",
    });

    if (confirmado) {
      setState(currentState =>
        prepararEstado(
          {
            fatura: null,
            pessoas: currentState.pessoas,
            atribuicoes: {},
            faturaAnterior: currentState.fatura,
            atribuicoesFaturaAnterior: currentState.atribuicoes,
          },
          profileConfig
        )
      );
    }
  };

  const totalPorPessoa: Record<string, number> = {};
  state.pessoas.forEach(pessoa => {
    totalPorPessoa[pessoa.id] = 0;
  });

  lancs.forEach(lancamento => {
    const atribuicao = state.atribuicoes[lancamento.id] || {};
    Object.entries(atribuicao).forEach(([pessoaId, valor]) => {
      if (totalPorPessoa[pessoaId] !== undefined) totalPorPessoa[pessoaId] += valor;
    });
  });

  const totalCalculadoLancamentos = lancs.reduce((soma, lancamento) => soma + lancamento.valor, 0);
  const totalFatura = state.fatura?.total ?? totalCalculadoLancamentos;
  const totalAtribuido = lancs.reduce(
    (soma, lancamento) => soma + somarAtribuicao(state.atribuicoes[lancamento.id]),
    0
  );
  const totalFaltante = totalFatura - totalAtribuido;
  const lancamentoDividindo = lancs.find(lancamento => lancamento.id === lancamentoDividindoId) || null;
  const atribuicaoDividindo = lancamentoDividindo ? divisaoRascunho : {};
  const totalDividindoAtribuido = somarAtribuicao(atribuicaoDividindo);
  const faltaDividindo = lancamentoDividindo
    ? arredondarCentavos(lancamentoDividindo.valor - totalDividindoAtribuido)
    : 0;
  const filtroDivisaoNormalizado = normalizarNome(filtroDivisao);
  const pessoasFiltradasDivisao = state.pessoas.filter(
    pessoa => !filtroDivisaoNormalizado || normalizarNome(pessoa.nome).includes(filtroDivisaoNormalizado)
  );
  const pessoasDisponiveisDivisao = pessoasFiltradasDivisao.filter(
    pessoa => atribuicaoDividindo[pessoa.id] === undefined
  );
  const pessoasAtribuidasDivisao = pessoasFiltradasDivisao.filter(
    pessoa => atribuicaoDividindo[pessoa.id] !== undefined
  );

  const imprimirResumo = () => {
    const linhasPessoas = state.pessoas
      .map(
        pessoa => `
        <tr>
          <td>${pessoa.nome}</td>
          <td>${fmt(totalPorPessoa[pessoa.id] || 0)}</td>
        </tr>
      `
      )
      .join("");

    const janela = window.open("", "_blank", "width=720,height=900");
    if (!janela) {
      toast.error("Nao foi possivel abrir a janela de impressao. Verifique o bloqueador de pop-ups.");
      return;
    }

    janela.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Resumo da divisao da fatura</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 40px;
              color: #172033;
              font-family: Arial, sans-serif;
              background: #f8fafc;
            }
            .page {
              max-width: 680px;
              margin: 0 auto;
              padding: 32px;
              background: #fff;
              border: 1px solid #e2e8f0;
              border-radius: 18px;
            }
            h1 {
              margin: 0 0 6px;
              font-size: 24px;
            }
            .subtitle {
              margin: 0 0 28px;
              color: #64748b;
              font-size: 14px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 28px;
            }
            th, td {
              padding: 14px 12px;
              border-bottom: 1px solid #e2e8f0;
              text-align: left;
              font-size: 15px;
            }
            th {
              color: #64748b;
              font-size: 12px;
              letter-spacing: .08em;
              text-transform: uppercase;
            }
            td:last-child, th:last-child {
              text-align: right;
              font-weight: 700;
            }
            .totals {
              display: grid;
              gap: 10px;
              padding-top: 4px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              padding: 12px 14px;
              border-radius: 12px;
              background: #f1f5f9;
              font-size: 14px;
            }
            .total-row strong {
              font-size: 15px;
            }
            @media print {
              body { padding: 0; background: #fff; }
              .page { border: 0; border-radius: 0; max-width: none; }
            }
          </style>
        </head>
        <body>
          <main class="page">
            <h1>Resumo da divisao da fatura</h1>
            <p class="subtitle">Valores finais por pessoa</p>
            <table>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>${linhasPessoas}</tbody>
            </table>
            <section class="totals">
              <div class="total-row"><span>Total da fatura</span><strong>${fmt(totalFatura)}</strong></div>
              <div class="total-row"><span>Ja atribuido</span><strong>${fmt(totalAtribuido)}</strong></div>
              <div class="total-row"><span>Falta atribuir</span><strong>${fmt(totalFaltante)}</strong></div>
            </section>
          </main>
          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    janela.document.close();
  };

  const confirmDialogNode = (
    <AlertDialog open={confirmDialog.open} onOpenChange={open => !open && responderConfirmacao(false)}>
      <AlertDialogContent>
        <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_65%)]" />
        <div className="relative grid gap-5">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => responderConfirmacao(false)}>
              {confirmDialog.cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              className={confirmDialog.variant === "destructive" ? "bg-destructive hover:bg-destructive/90" : ""}
              onClick={() => responderConfirmacao(true)}
            >
              {confirmDialog.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (!state.fatura) {
    return (
      <>
        <UploadScreen
          loading={loading}
          onLogout={sairDoPerfil}
          onUpload={handleUpload}
        />
        {confirmDialogNode}
      </>
    );
  }

  return (
    <div className="min-h-screen gradient-subtle">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-xl">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-glow">
              <CreditCard className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none">DivideFatura</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">{lancs.length} lancamentos</p>
                <Badge variant="outline">{profileConfig.label}</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={imprimirResumo}>
              <Printer className="h-4 w-4" /> Imprimir / PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              Nova fatura
            </Button>
            <Button size="sm" variant="ghost" onClick={sairDoPerfil}>
              <LogOut className="h-4 w-4" /> Trocar acesso
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-3xl space-y-4 py-6">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Pessoas</h2>
          </div>
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {state.pessoas.map(pessoa => (
              <div
                key={pessoa.id}
                className="grid grid-cols-[10px_minmax(0,1fr)_78px_20px] items-center gap-2 rounded-full border py-1 pl-3 pr-1"
                style={{ borderColor: pessoa.cor }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: pessoa.cor }} />
                <span className="truncate text-sm font-medium">{pessoa.nome}</span>
                <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {fmt(totalPorPessoa[pessoa.id] || 0)}
                </span>
                <button
                  onClick={() => removePessoa(pessoa.id)}
                  className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total da fatura</p>
              <p className="mt-1 font-mono text-sm font-semibold">{fmt(totalFatura)}</p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ja atribuido</p>
              <p className="mt-1 font-mono text-sm font-semibold">{fmt(totalAtribuido)}</p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Falta atribuir</p>
              <p
                className={`mt-1 font-mono text-sm font-semibold ${
                  Math.abs(totalFaltante) < 0.01 ? "text-emerald-600" : "text-primary"
                }`}
              >
                {fmt(totalFaltante)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Nome da pessoa"
              value={novaPessoa}
              onChange={event => setNovaPessoa(event.target.value)}
              onKeyDown={event => event.key === "Enter" && addPessoa()}
            />
            <Button onClick={addPessoa}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </Card>

        <Card className="divide-y">
          {lancs.map(lancamento => {
            const atribuicao = state.atribuicoes[lancamento.id] || {};
            const negativo = ehLancamentoNegativo(lancamento);
            const totalLancamentoAtribuido = somarAtribuicao(atribuicao);
            const faltaLancamento = negativo ? 0 : arredondarCentavos(lancamento.valor - totalLancamentoAtribuido);
            const responsavelNegativo = negativo
              ? state.pessoas.find(pessoa => atribuicao[pessoa.id] !== undefined)
              : null;
            const pessoasAtribuidas = state.pessoas.filter(pessoa => atribuicao[pessoa.id] !== undefined);

            return (
              <div key={lancamento.id} className="flex items-center gap-3 p-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{lancamento.data}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{lancamento.descricao}</p>
                    {lancamento.parcelaTotal && (
                      <Badge variant="outline" className="mt-0.5 h-4 border-primary/30 px-1.5 text-[10px] text-primary">
                        {lancamento.parcelaAtual}/{lancamento.parcelaTotal}
                      </Badge>
                    )}
                    {!negativo && (
                      <p
                        className={`mt-1 text-[11px] ${
                          Math.abs(faltaLancamento) < 0.01 ? "text-emerald-600" : "text-muted-foreground"
                        }`}
                      >
                        Falta {fmt(faltaLancamento)}
                      </p>
                    )}
                    {negativo && responsavelNegativo && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Desconto para {responsavelNegativo.nome}
                      </p>
                    )}
                    {!negativo && pessoasAtribuidas.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {pessoasAtribuidas.map(pessoa => (
                          <Badge key={pessoa.id} variant="secondary" className="font-mono text-[10px]">
                            {pessoa.nome}: {fmt(atribuicao[pessoa.id])}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="w-20 shrink-0 text-right font-mono text-sm font-semibold tabular-nums">
                    {fmt(lancamento.valor)}
                  </div>
                </div>
                {negativo && responsavelNegativo && (
                  <Badge variant="secondary" className="w-fit font-mono">
                    {responsavelNegativo.nome}: {fmt(totalLancamentoAtribuido)}
                  </Badge>
                )}
                {!negativo && (
                  <Button size="sm" variant="outline" onClick={() => abrirDivisao(lancamento.id)} className="shrink-0">
                    Dividir
                  </Button>
                )}
              </div>
            );
          })}
          {lancs.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhum lancamento encontrado.</p>
          )}
        </Card>
      </main>

      <Dialog open={Boolean(lancamentoDividindoId)} onOpenChange={open => !open && fecharDivisaoSemSalvar()}>
        <DialogContent className="max-w-2xl">
          {lancamentoDividindo && (
            <>
              <DialogHeader>
                <DialogTitle>Dividir despesa</DialogTitle>
                <DialogDescription>
                  {lancamentoDividindo.descricao} · {fmt(lancamentoDividindo.valor)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <Input
                  placeholder="Filtrar pessoas"
                  value={filtroDivisao}
                  onChange={event => setFiltroDivisao(event.target.value)}
                />
                <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                  <Select value={pessoaParaAdicionarId} onValueChange={setPessoaParaAdicionarId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a pessoa" />
                    </SelectTrigger>
                    <SelectContent>
                      {pessoasDisponiveisDivisao.map(pessoa => (
                        <SelectItem key={pessoa.id} value={pessoa.id}>
                          {pessoa.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    inputMode="decimal"
                    placeholder={fmt(Math.max(0, faltaDividindo))}
                    value={valorParaAdicionar}
                    onChange={event => setValorParaAdicionar(event.target.value)}
                    onKeyDown={event => event.key === "Enter" && adicionarPessoaDivisao()}
                    className="font-mono"
                  />
                  <Button onClick={adicionarPessoaDivisao} disabled={!pessoaParaAdicionarId || faltaDividindo <= 0}>
                    <Plus className="h-4 w-4" /> Adicionar
                  </Button>
                </div>

                <div className="rounded-xl border">
                  <ScrollArea className="max-h-72">
                    <div className="divide-y">
                      {pessoasAtribuidasDivisao.map(pessoa => {
                        const valor = atribuicaoDividindo[pessoa.id];
                        return (
                          <div key={pessoa.id} className="flex items-center gap-3 p-3">
                            <span className="h-2 w-2 rounded-full" style={{ background: pessoa.cor }} />
                            <span className="flex-1 text-sm font-medium">{pessoa.nome}</span>
                            <Input
                              inputMode="decimal"
                              value={valor}
                              onChange={event => setValorDivisaoRascunho(pessoa.id, event.target.value)}
                              className="h-8 w-28 text-xs font-mono"
                            />
                            <button
                              onClick={() => removerPessoaDivisao(pessoa.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                      {Object.keys(atribuicaoDividindo).length === 0 && (
                        <p className="p-4 text-center text-sm text-muted-foreground">
                          Nenhuma pessoa adicionada nessa despesa ainda.
                        </p>
                      )}
                      {Object.keys(atribuicaoDividindo).length > 0 && pessoasAtribuidasDivisao.length === 0 && (
                        <p className="p-4 text-center text-sm text-muted-foreground">
                          Nenhuma pessoa encontrada com esse filtro.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border bg-muted/40 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Despesa</p>
                    <p className="mt-1 font-mono text-sm font-semibold">{fmt(lancamentoDividindo.valor)}</p>
                  </div>
                  <div className="rounded-xl border bg-muted/40 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Dividido</p>
                    <p className="mt-1 font-mono text-sm font-semibold">{fmt(totalDividindoAtribuido)}</p>
                  </div>
                  <div className="rounded-xl border bg-muted/40 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Falta</p>
                    <p
                      className={`mt-1 font-mono text-sm font-semibold ${
                        Math.abs(faltaDividindo) < 0.01 ? "text-emerald-600" : "text-primary"
                      }`}
                    >
                      {fmt(faltaDividindo)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">Fechar no X descarta as alteracoes feitas aqui.</p>
                  <Button onClick={salvarDivisao} className="sm:w-auto">
                    Salvar e voltar
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {confirmDialogNode}
    </div>
  );
}

interface UploadScreenProps {
  onUpload: (file: File) => void;
  loading: boolean;
  onLogout: () => void;
}

function UploadScreen({ onUpload, loading, onLogout }: UploadScreenProps) {
  const [drag, setDrag] = useState(false);

  return (
    <div className="min-h-screen gradient-subtle flex flex-col">
      <div className="container flex flex-1 flex-col items-center justify-center py-12">
        <Card
          className={`w-full max-w-2xl border-2 border-dashed p-12 transition-all ${
            drag ? "border-primary bg-accent shadow-glow" : "hover:border-primary/50"
          }`}
          onDragOver={event => {
            event.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={event => {
            event.preventDefault();
            setDrag(false);
            const file = event.dataTransfer.files[0];
            if (file) onUpload(file);
          }}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-glow">
              {loading ? (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              ) : (
                <Upload className="h-7 w-7 text-primary-foreground" />
              )}
            </div>
            <div>
              <h2 className="mb-1 text-lg font-bold">
                {loading ? "Processando fatura..." : "Arraste o PDF aqui"}
              </h2>
              <p className="text-sm text-muted-foreground">PDF da fatura Itau · Tudo e processado no seu navegador</p>
            </div>
            <label>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={event => event.target.files?.[0] && onUpload(event.target.files[0])}
              />
              <Button asChild disabled={loading}>
                <span className="cursor-pointer">
                  <FileText className="h-4 w-4" /> Selecionar arquivo
                </span>
              </Button>
            </label>
          </div>
        </Card>
        <Button variant="ghost" size="sm" onClick={onLogout} className="mt-4">
          <LogOut className="h-4 w-4" /> Trocar acesso
        </Button>
      </div>
    </div>
  );
}
