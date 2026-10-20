import { formatInt } from "@/lib/format";

export type PriceTierColumn =
  | "retail_price"
  | "price_25"
  | "price_35"
  | "price_42"
  | "price_50"
  | "price_bronze"
  | "price_prata"
  | "price_ouro";

export const PRICE_TIERS: {
  code: string;
  column: PriceTierColumn;
  label: string;
}[] = [
  { code: "retail", column: "retail_price", label: "Cliente" },
  { code: "t0.25", column: "price_25", label: "25%" },
  { code: "t0.35", column: "price_35", label: "35%" },
  { code: "t0.42", column: "price_42", label: "42%" },
  { code: "t0.5", column: "price_50", label: "50%" },
  { code: "bronze", column: "price_bronze", label: "Bronze" },
  { code: "prata", column: "price_prata", label: "Prata" },
  { code: "ouro", column: "price_ouro", label: "Ouro" },
];

export type PriceSectionKey =
  | "ni"
  | "ne"
  | "acesso"
  | "extras"
  | "cartelas"
  | "outros";

export const PRICE_SECTIONS: {
  key: PriceSectionKey;
  label: string;
}[] = [
  { key: "ni", label: "Nutrição interna" },
  { key: "ne", label: "Nutrição externa" },
  { key: "acesso", label: "Espaço" },
  { key: "extras", label: "Espaço · extras" },
  { key: "cartelas", label: "Cartelas" },
  { key: "outros", label: "Outros" },
];

export function priceSectionKey(itemClass: string | null): PriceSectionKey {
  if (itemClass === "N.I") return "ni";
  if (itemClass === "N.E") return "ne";
  if (itemClass === "E.X") return "extras";
  if (itemClass === "E.AC") return "cartelas";
  if (itemClass === "E.A" || itemClass === "E.AF") return "acesso";
  return "outros";
}

/**
 * The printed table keeps the spreadsheet convention: whole reais, rounded up.
 * Product prices in the database keep their exact cents for sale calculations.
 */
export function formatTablePrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return formatInt(Math.ceil(Number(value)));
}
