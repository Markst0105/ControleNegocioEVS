import readXlsxFile from "read-excel-file/node";

import { parseMoneyInput } from "@/lib/format";
import type { PriceTierCode } from "@/lib/prices";

/**
 * Reads a price spreadsheet shaped like the workbook's "Novos Preços HLF" tab:
 *
 *   SKU | Produto | PV | Venda | 0.25 | 0.35 | 0.42 | 0.5 | Bronze | Prata | Ouro
 *
 * The columns are matched by their header text, so a sheet with extra columns
 * or a different order still works. Discount headers are accepted as "0.25",
 * "0,25" or "25%".
 */

export type PriceSheetRow = {
  sku: string;
  name: string | null;
  pv: number | null;
  prices: Partial<Record<PriceTierCode, number>>;
};

export type PriceSheetSkipped = {
  row: number;
  reason: string;
};

export type PriceSheetParse = {
  sheet: string;
  rows: PriceSheetRow[];
  skipped: PriceSheetSkipped[];
  /** Header columns that were not recognised (ignored). */
  unknownHeaders: string[];
  /** Products listed twice in the sheet — the first row wins. */
  duplicateSkus: string[];
};

type ColumnKind = "sku" | "name" | "pv" | PriceTierCode;

const TIER_BY_FRACTION: [number, PriceTierCode][] = [
  [0.25, "t0.25"],
  [0.35, "t0.35"],
  [0.42, "t0.42"],
  [0.5, "t0.5"],
];

const RETAIL_HEADERS = new Set([
  "venda",
  "precovenda",
  "preco",
  "precodevenda",
  "vendaavulsa",
  "balcao",
  "retail",
]);

const NAME_HEADERS = new Set(["produto", "nome", "descricao", "descricaooproduto"]);

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/\s+/g, "")
    .trim();
}
function columnKind(header: string): ColumnKind | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  if (normalized === "sku" || normalized === "codigo") return "sku";
  if (NAME_HEADERS.has(normalized)) return "name";
  if (normalized === "pv" || normalized === "pontosdevolume") return "pv";
  if (RETAIL_HEADERS.has(normalized)) return "retail";
  if (normalized === "bronze") return "bronze";
  if (normalized === "prata") return "prata";
  if (normalized === "ouro") return "ouro";

  const percent = normalized.endsWith("%");
  const numeric = Number(percent ? normalized.slice(0, -1) : normalized);
  if (!Number.isFinite(numeric)) return null;
  const fraction = numeric > 1 ? numeric / 100 : numeric;
  for (const [value, code] of TIER_BY_FRACTION) {
    if (Math.abs(fraction - value) < 0.001) return code;
  }
  return null;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return "";
  return String(value).trim();
}

function cellNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = parseMoneyInput(value);
    return parsed === null ? null : parsed;
  }
  return null;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function findHeaderRow(
  rows: unknown[][],
): { index: number; columns: Map<ColumnKind, number> } | null {
  const limit = Math.min(rows.length, 20);
  for (let index = 0; index < limit; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row)) continue;
    const columns = new Map<ColumnKind, number>();
    row.forEach((cell, columnIndex) => {
      const kind = columnKind(cellText(cell));
      if (kind && !columns.has(kind)) columns.set(kind, columnIndex);
    });
    if (columns.has("sku") && columns.has("name")) {
      return { index, columns };
    }
  }
  return null;
}

/**
 * Parses the rows of a price sheet. Exported so it can be tested without
 * building an .xlsx file.
 */
export function parsePriceSheetRows(
  rows: unknown[][],
  sheetName = "planilha",
): PriceSheetParse {
  const header = findHeaderRow(rows);
  if (!header) {
    throw new Error(
      "Não encontrei a tabela de preços. A planilha precisa de uma linha com as colunas SKU e Produto.",
    );
  }

  const parsed: PriceSheetRow[] = [];
  const skipped: PriceSheetSkipped[] = [];
  const duplicateSkus: string[] = [];
  const seen = new Set<string>();

  for (let index = header.index + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row)) continue;

    const sku = cellText(row[header.columns.get("sku") ?? -1]);
    if (!sku) {
      if (row.some((cell) => cellText(cell) !== "")) {
        skipped.push({ row: index + 1, reason: "linha sem SKU" });
      }
      continue;
    }

    // The workbook repeats the print header at page breaks ("#SKU | Produto ...").
    if (sku.replace(/^#/, "").trim().toLowerCase() === "sku") {
      skipped.push({ row: index + 1, reason: "cabeçalho repetido" });
      continue;
    }

    const nameCell = header.columns.get("name");
    const name = nameCell === undefined ? null : cellText(row[nameCell]) || null;

    const pvColumn = header.columns.get("pv");
    const pv =
      pvColumn === undefined ? null : cellNumber(row[pvColumn]);

    const prices: Partial<Record<PriceTierCode, number>> = {};
    for (const tier of [
      "retail",
      "t0.25",
      "t0.35",
      "t0.42",
      "t0.5",
      "bronze",
      "prata",
      "ouro",
    ] as PriceTierCode[]) {
      const column = header.columns.get(tier);
      if (column === undefined) continue;
      const value = cellNumber(row[column]);
      if (value === null) continue;
      prices[tier] = round(value, 2);
    }

    const key = sku.toLowerCase();
    if (seen.has(key)) {
      duplicateSkus.push(sku);
      skipped.push({ row: index + 1, reason: `SKU repetido (${sku})` });
      continue;
    }
    seen.add(key);

    parsed.push({
      sku,
      name,
      pv: pv === null ? null : round(pv, 4),
      prices,
    });
  }

  const unknownHeaders: string[] = [];
  const headerRow = rows[header.index] as unknown[];
  headerRow.forEach((cell, columnIndex) => {
    const text = cellText(cell);
    if (!text) return;
    const known = [...header.columns.values()].includes(columnIndex);
    if (!known) unknownHeaders.push(text);
  });

  return {
    sheet: sheetName,
    rows: parsed,
    skipped,
    unknownHeaders,
    duplicateSkus,
  };
}

/**
 * Reads an .xlsx file and parses the price sheet it carries. The sheet named
 * like "Novos Preços HLF" is preferred; otherwise the first sheet with a SKU
 * and Produto header is used.
 */
export async function parsePriceSheet(input: Buffer): Promise<PriceSheetParse> {
  const sheets = await readXlsxFile(input);
  if (sheets.length === 0) {
    throw new Error("A planilha não tem nenhuma aba.");
  }

  const preferred =
    sheets.find((sheet) =>
      /novos\s*precos\s*hlf/i.test(normalizeHeader(sheet.sheet)),
    ) ?? null;
  const candidates = preferred ? [preferred] : sheets;

  for (const sheet of candidates) {
    const header = findHeaderRow(sheet.data as unknown[][]);
    if (!header) continue;
    return parsePriceSheetRows(sheet.data as unknown[][], sheet.sheet);
  }

  throw new Error(
    "Não encontrei a tabela de preços. A planilha precisa de uma linha com as colunas SKU e Produto.",
  );
}
