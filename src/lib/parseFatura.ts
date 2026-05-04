import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export type LancamentoTipo = "compra" | "saque" | "produto_servico" | "pagamento";

export interface Lancamento {
  id: string;
  data: string;
  descricao: string;
  categoria: string;
  local?: string;
  valor: number;
  tipo: LancamentoTipo;
  parcelaAtual?: number;
  parcelaTotal?: number;
}

export interface FaturaResumo {
  titular?: string;
  cartao?: string;
  vencimento?: string;
  total?: number;
  lancamentos: Lancamento[];
}

type RawItem = { x: number; y: number; width: number; str: string; page: number };
type Side = "left" | "right";

const SECTION_RES = {
  pagamentos: /pagamentos\s+efetuados/i,
  compras: /lan[çc]amentos?:?\s*compras\s*e\s*saques/i,
  produtos: /lan[çc]amentos?:?\s*produtos\s*e\s*servi[çc]os/i,
  parceladas: /compras\s+parceladas\s*-\s*pr[óo]ximas\s+faturas/i,
};

export async function extractTextFromPdf(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  type Segment = {
    page: number;
    y: number;
    side: Side;
    items: RawItem[];
    text: string;
  };

  const segments: Segment[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    // Nas faturas Itaú há duas colunas; o divisor real fica depois do valor da coluna esquerda.
    const splitX = viewport.width * 0.6;
    const content = await page.getTextContent();

    const rowMap = new Map<number, RawItem[]>();
    for (const it of content.items as any[]) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5] / 2) * 2;
      if (!rowMap.has(y)) rowMap.set(y, []);
      rowMap.get(y)!.push({
        page: p,
        x: it.transform[4],
        y,
        width: it.width || 0,
        str: it.str,
      });
    }

    for (const [y, rowItems] of rowMap) {
      const sorted = rowItems.sort((a, b) => a.x - b.x);
      const bySide: Record<Side, RawItem[]> = {
        left: sorted.filter(i => i.x < splitX),
        right: sorted.filter(i => i.x >= splitX),
      };

      for (const side of ["left", "right"] as const) {
        const sideItems = bySide[side].filter(i => i.str.trim());
        if (!sideItems.length) continue;
        const text = sideItems
          .map(i => i.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) segments.push({ page: p, y, side, items: sideItems, text });
      }
    }
  }

  segments.sort((a, b) => a.page - b.page || (a.side === b.side ? 0 : a.side === "left" ? -1 : 1) || b.y - a.y);

  type Marker = { kind: keyof typeof SECTION_RES; page: number; side: Side; y: number };
  const markers: Marker[] = [];
  for (const s of segments) {
    for (const k of Object.keys(SECTION_RES) as (keyof typeof SECTION_RES)[]) {
      if (SECTION_RES[k].test(s.text)) markers.push({ kind: k, page: s.page, side: s.side, y: s.y });
    }
  }
  markers.sort((a, b) => a.page - b.page || (a.side === b.side ? 0 : a.side === "left" ? -1 : 1) || b.y - a.y);

  const sectionOfSegment = (s: Segment): keyof typeof SECTION_RES | null => {
    let current: Marker | null = null;
    for (const m of markers) {
      if (m.side !== s.side) continue;
      const before = m.page < s.page || (m.page === s.page && m.y >= s.y);
      if (before) current = m;
      else if (m.page === s.page && m.side === s.side) break;
    }
    return current?.kind ?? null;
  };

  const wanted: (keyof typeof SECTION_RES)[] = ["compras", "produtos"];
  const out: string[] = [];

  segments
    .filter(s => /total\s+(desta|da)\s+fatura|vencimento:?|\d{4}\.X+\.X+\.\d{4}/i.test(s.text))
    .forEach(s => out.push(s.text));

  for (const sec of wanted) {
    const secSegments = segments.filter(s => sectionOfSegment(s) === sec);
    const pages = [...new Set(secSegments.map(s => s.page))].sort((a, b) => a - b);
    for (const pageNum of pages) {
      for (const side of ["left", "right"] as const) {
        secSegments
          .filter(s => s.page === pageNum && s.side === side)
          .sort((a, b) => b.y - a.y)
          .forEach(s => out.push(s.text));
      }
    }
  }

  return out.join("\n");
}

function parseValor(s: string): number | null {
  // Pega o ÚLTIMO número no formato 1.234,56 da string (valor fica sempre no fim da linha)
  const matches = s.match(/-?\s*[\d.]+,\d{2}/g);
  if (!matches) return null;
  const v = matches[matches.length - 1].replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(v);
}

// Remove acentos e normaliza para detectar cabeçalhos/seções
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Linhas que NÃO são lançamentos mesmo começando com data
const SKIP_PATTERNS = [
  /total/i,
  /saldo/i,
  /limite/i,
  /vencimento/i,
  /pagamento\s+efetuado/i,
  /pgto/i,
  /encargos/i,
  /juros/i,
  /iof/i,
  /multa/i,
];

export function parseFaturaText(text: string): FaturaResumo {
  const rawLines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const lancamentos: Lancamento[] = [];
  let titular: string | undefined;
  let cartao: string | undefined;
  let vencimento: string | undefined;
  let total: number | undefined;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // Metadados
    const cartM = line.match(/(\d{4}\.X+\.X+\.\d{4})/);
    if (cartM) cartao = cartM[1];
    const vencM = line.match(/Vencimento:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (vencM) vencimento = vencM[1];
    const totM = line.match(/Total\s+(?:desta|da)\s+fatura\s+R?\$?\s*([\d.,]+)/i);
    if (totM) total = parseValor(totM[0]) || total;

    // Para os assim que entrar em compras parceladas das próximas faturas
    if (/Compras parceladas\s*-\s*pr[óo]ximas faturas/i.test(line)) break;

    // Tem que começar com data DD/MM
    const m = line.match(/^(\d{2}\/\d{2})\s+(.+)/);
    if (!m) continue;

    const data = m[1];
    let resto = m[2];

    // Pula totalizadores e linhas que não são lançamento
    if (SKIP_PATTERNS.some(p => p.test(resto))) continue;

    const valor = parseValor(resto);
    if (valor === null) continue;

    // Remove o último valor (com possível "-") do final
    resto = resto.replace(/-?\s*[\d.]+,\d{2}\s*$/, "").trim();

    // Parcela: pode estar colada (ex: "Canva0449512/12") ou separada ("06/06")
    let parcelaAtual: number | undefined;
    let parcelaTotal: number | undefined;
    const pm = resto.match(/(\d{1,2})\/(\d{1,2})\s*$/);
    if (pm) {
      parcelaAtual = parseInt(pm[1]);
      parcelaTotal = parseInt(pm[2]);
      // remove a parcela mantendo o restante do nome
      resto = resto.slice(0, resto.length - pm[0].length).trim();
    }

    // Categoria: tenta na próxima linha se parecer "CATEG.local"
    let categoria = "Outros";
    let local: string | undefined;
    const next = rawLines[i + 1] || "";
    const isNextDate = /^\d{2}\/\d{2}\s/.test(next);
    if (
      next &&
      !isNextDate &&
      /\./.test(next) &&
      next.length < 80 &&
      !/[\d.,]+,\d{2}$/.test(next) // não termina com valor
    ) {
      const parts = next.split(".");
      categoria = parts[0].trim() || categoria;
      local = parts.slice(1).join(".").trim() || undefined;
      i++;
    }

    let tipo: LancamentoTipo = "compra";
    if (/saque/i.test(resto)) tipo = "saque";
    if (valor < 0) tipo = "pagamento";

    lancamentos.push({
      id: `${data}-${resto}-${valor}-${lancamentos.length}`,
      data,
      descricao: resto || "(sem descrição)",
      categoria,
      local,
      valor,
      tipo,
      parcelaAtual,
      parcelaTotal,
    });
  }

  return { titular, cartao, vencimento, total, lancamentos };
}

export async function parseFaturaFromFile(file: File): Promise<FaturaResumo> {
  const text = await extractTextFromPdf(file);
  return parseFaturaText(text);
}
