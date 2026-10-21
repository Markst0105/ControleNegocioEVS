/**
 * Checks the price-sheet parser against the real workbook and against the
 * header variants a supplier may send.
 *
 *   npm run test:prices
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parsePriceSheet,
  parsePriceSheetRows,
} from "../src/lib/prices/import-price-sheet";

const ROOT = process.cwd();
const WORKBOOK = join(ROOT, "Controle do Negócio 2026-10.xlsx");

let failures = 0;

function check(label: string, condition: boolean, detail?: string | null) {
  if (condition) {
    console.log(`PASS  ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

function equal(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(
    label,
    ok,
    ok ? undefined : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
  );
}

async function main() {
  // --- header variants ------------------------------------------------------
  const variants = parsePriceSheetRows([
    ["SKU", "Produto", "PV", "Venda", "0,25", "0.35", "0.42", "0.5", "Bronze", "Prata", "Ouro", "Obs"],
    ["#001", "Produto Teste", 12.3456, 100, "75,50", 55, 50, 40, 70, 60, 50, "ignorar"],
  ]);

  check("variantes: uma linha lida", variants.rows.length === 1, `got ${variants.rows.length}`);
  const variant = variants.rows[0];
  check("variantes: SKU", variant?.sku === "#001", variant?.sku);
  check("variantes: nome", variant?.name === "Produto Teste", variant?.name);
  check("variantes: PV com 4 casas", variant?.pv === 12.3456, String(variant?.pv));
  check("variantes: venda", variant?.prices.retail === 100, String(variant?.prices.retail));
  check("variantes: 0,25 (pt-BR)", variant?.prices["t0.25"] === 75.5, String(variant?.prices["t0.25"]));
  check("variantes: 0.5", variant?.prices["t0.5"] === 40, String(variant?.prices["t0.5"]));
  check("variantes: bronze", variant?.prices.bronze === 70, String(variant?.prices.bronze));
  check(
    "variantes: coluna desconhecida ignorada",
    variants.unknownHeaders.includes("Obs"),
    variants.unknownHeaders.join(","),
  );

  const percentVariants = parsePriceSheetRows([
    ["SKU", "Produto", "Venda", "25%", "50%"],
    ["#002", "Produto Percentual", 100, 60, 30],
  ]);
  check("variantes: 25% como cabeçalho", percentVariants.rows[0]?.prices["t0.25"] === 60, String(percentVariants.rows[0]?.prices["t0.25"]));
  check("variantes: 50% como cabeçalho", percentVariants.rows[0]?.prices["t0.5"] === 30, String(percentVariants.rows[0]?.prices["t0.5"]));

  // --- skipped rows ---------------------------------------------------------
  const messy = parsePriceSheetRows([
    ["SKU", "Produto", "Venda"],
    ["", "Sem sku", 10],
    ["#002", "Sem preço", null],
    ["#003", "Com preço", 20],
    ["#003", "Repetido", 30],
  ]);
  check(
    "linhas: sem SKU ignorada",
    messy.skipped.some((item) => item.reason === "linha sem SKU"),
    JSON.stringify(messy.skipped),
  );
  check(
    "linhas: SKU repetido avisado",
    messy.duplicateSkus.includes("#003"),
    messy.duplicateSkus.join(","),
  );
  equal("linhas: repetida não entra duas vezes", messy.rows.length, 2);
  equal(
    "linhas: linha sem preço continua (nome e PV)",
    messy.rows.map((row) => row.sku),
    ["#002", "#003"],
  );

  const repeatedHeader = parsePriceSheetRows([
    ["SKU", "Produto", "Venda"],
    ["#SKU", "Produto", "PV"],
    ["#004", "Produto Real", 10],
  ]);
  equal(
    "linhas: cabeçalho repetido ignorado",
    repeatedHeader.rows.map((row) => row.sku),
    ["#004"],
  );

  // --- missing header -------------------------------------------------------
  let threw = false;
  try {
    parsePriceSheetRows([
      ["Nome", "Preço"],
      ["x", 1],
    ]);
  } catch {
    threw = true;
  }
  check("sem cabeçalho SKU: erro claro", threw);

  // --- the real workbook ----------------------------------------------------
  if (existsSync(WORKBOOK)) {
    const parsed = await parsePriceSheet(readFileSync(WORKBOOK));
    check(
      "planilha real: aba Novos Preços HLF",
      parsed.sheet === "Novos Preços HLF",
      parsed.sheet,
    );
    // 78 linhas: 1 cabeçalho, 75 produtos e 2 cabeçalhos repetidos (quebra de página).
    check("planilha real: 75 produtos", parsed.rows.length === 75, `got ${parsed.rows.length}`);
    check(
      "planilha real: só os cabeçalhos repetidos são ignorados",
      parsed.skipped.length === 2 &&
        parsed.skipped.every((item) => item.reason === "cabeçalho repetido"),
      JSON.stringify(parsed.skipped),
    );
    check(
      "planilha real: sem SKU repetido",
      parsed.duplicateSkus.length === 0,
      parsed.duplicateSkus.join(","),
    );
    const first = parsed.rows[0];
    equal("planilha real: primeiro SKU", first?.sku, "#325K");
    equal("planilha real: nome", first?.name, "24 Hours - Creatina Premium 150g");
    equal("planilha real: PV", first?.pv, 18.45);
    equal("planilha real: venda", first?.prices.retail, 181);
    equal("planilha real: 25%", first?.prices["t0.25"], 132.61);
    equal("planilha real: ouro", first?.prices.ouro, 119.44);
  } else {
    console.log("SKIP  a pasta de trabalho não está neste ambiente");
  }

  console.log();
  if (failures > 0) {
    console.error(`${failures} verificação(ões) falharam.`);
    process.exit(1);
  }
  console.log("Todas as verificações passaram.");
}

void main();
