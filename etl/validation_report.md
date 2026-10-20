# ETL Validation Report

Source: `Controle do Negócio 2026-10.xlsx`

## Counts
- Products: 160
- Products with retail price: 137 / 160
- Clients (normalized): 557 / raw variants: 559
- Sales: 18182
- Installments: 17971
- Inventory movements: 1629
- Expenses: 110
- MDO days: 730 (2025-01-01 → 2026-12-31)

## Unknown codes (review manually)
```
Payment: {}
Deal:    {'0.14000000000000001': 36}
Class:   {}
```

## Notes
- `MDO-Mês`, `Consolidado`, `Despesas Totais`, `Consumo e Investimento` are NOT imported; they are recomputed by SQL views.
- `Estoque (emprestimos 2)` (hidden legacy ledger, since 2012) is NOT imported.
- `Acompanhamento ND` and `Análise Organizacional` (hidden) are NOT imported.
- Sales rows without a date in column A were skipped.
- Inventory movement dates are best-effort (year 2025 assumed from column-header text).
- Product prices come from `Novos Preços HLF`; items missing there take retail/tier values from `Tabela de Preços` columns E–L. Supplies, packaging and financial placeholders get no shelf price.
- SKUs are matched case-insensitively; the workbook mixes `#497K` and `#497k`.
- `product_components` (composed EVS items cost build-up) is left empty; the admin defines components in the app.
- Expense scope is inferred from category; rows without a scope marker default to `pessoal`.
- `supabase/seed.sql` is the combined copy of seeds 001–007 used by `supabase db push --include-seed` / `supabase db reset`.
- `etl/check_seed_schema.py` statically validates the seeds against the schema (tables, columns, arity, NULLs, lookups).
## Validation vs workbook cached values

Recomputed from imported `sales` vs cached in `Consumo e Investimento` (rows 2-26) and `Consolidado` (rows 2-14).

| month | source | cost recomputed | cost cached | pv recomputed | pv cached | match |
|-------|--------|-----------------|-------------|---------------|-----------|-------|
| 2025-01 | CONS | 3,299.00 | 3,299.00 | 681.90 | 681.90 | ✓ |
| 2025-01 | BRINDE | 96.78 | 96.78 | 15.55 | 15.55 | ✓ |
| 2025-01 | NEG | 2,685.00 | 2,685.00 | 584.45 | 584.45 | ✓ |
| 2025-01 | SALE (workbook criterion D<=0) | 4,376.12 | 4,376.12 | 860.54 | 860.54 | ✓ |
| 2025-01 | SALE + descontos (BioAvalia) | 5,187.12 | 4,376.12 | 1,038.44 | 860.54 | ℹ Δcost +811.00 / Δpv +177.90 |
| 2025-02 | CONS | 2,986.00 | 2,986.00 | 634.00 | 634.00 | ✓ |
| 2025-02 | BRINDE | 134.07 | 134.07 | 20.74 | 20.74 | ✓ |
| 2025-02 | NEG | 2,233.00 | 2,233.00 | 493.05 | 493.05 | ✓ |
| 2025-02 | SALE (workbook criterion D<=0) | 4,195.61 | 4,195.61 | 789.82 | 789.82 | ✓ |
| 2025-02 | SALE + descontos (BioAvalia) | 4,888.61 | 4,195.61 | 940.72 | 789.82 | ℹ Δcost +693.00 / Δpv +150.90 |
| 2025-03 | CONS | 3,288.00 | 3,288.00 | 693.50 | 693.50 | ✓ |
| 2025-03 | BRINDE | 136.87 | 136.87 | 22.73 | 22.73 | ✓ |
| 2025-03 | NEG | 3,558.00 | 3,558.00 | 804.50 | 804.50 | ✓ |
| 2025-03 | SALE (workbook criterion D<=0) | 3,995.25 | 3,995.25 | 719.92 | 719.92 | ✓ |
| 2025-03 | SALE + descontos (BioAvalia) | 5,780.25 | 3,995.25 | 1,111.97 | 719.92 | ℹ Δcost +1,785.00 / Δpv +392.05 |
| 2025-04 | CONS | 3,322.00 | 3,322.00 | 692.25 | 692.25 | ✓ |
| 2025-04 | BRINDE | 83.09 | 83.09 | 12.58 | 12.58 | ✓ |
| 2025-04 | NEG | 2,965.00 | 2,965.00 | 596.90 | 596.90 | ✓ |
| 2025-04 | SALE (workbook criterion D<=0) | 3,762.29 | 3,762.29 | 632.37 | 632.37 | ✓ |
| 2025-04 | SALE + descontos (BioAvalia) | 4,092.29 | 3,762.29 | 699.77 | 632.37 | ℹ Δcost +330.00 / Δpv +67.40 |
| 2025-05 | CONS | 3,018.00 | 3,018.00 | 595.75 | 595.75 | ✓ |
| 2025-05 | BRINDE | 180.49 | 180.49 | 26.46 | 26.46 | ✓ |
| 2025-05 | NEG | 2,848.00 | 2,848.00 | 600.40 | 600.40 | ✓ |
| 2025-05 | SALE (workbook criterion D<=0) | 5,075.08 | 5,075.08 | 864.86 | 864.86 | ✓ |
| 2025-05 | SALE + descontos (BioAvalia) | 6,078.08 | 5,075.08 | 1,065.86 | 864.86 | ℹ Δcost +1,003.00 / Δpv +201.00 |
| 2025-06 | CONS | 2,636.00 | 2,636.00 | 521.30 | 521.30 | ✓ |
| 2025-06 | BRINDE | 41.14 | 41.14 | 5.94 | 5.94 | ✓ |
| 2025-06 | NEG | 2,359.29 | 2,359.29 | 458.44 | 458.44 | ✓ |
| 2025-06 | SALE (workbook criterion D<=0) | 4,803.12 | 4,803.12 | 804.37 | 804.37 | ✓ |
| 2025-06 | SALE + descontos (BioAvalia) | 5,855.12 | 4,803.12 | 1,017.57 | 804.37 | ℹ Δcost +1,052.00 / Δpv +213.20 |
| 2025-07 | CONS | 2,906.00 | 2,906.00 | 572.55 | 572.55 | ✓ |
| 2025-07 | BRINDE | 127.13 | 127.13 | 20.33 | 20.33 | ✓ |
| 2025-07 | NEG | 3,873.00 | 3,873.00 | 840.85 | 840.85 | ✓ |
| 2025-07 | SALE (workbook criterion D<=0) | 5,111.21 | 5,111.21 | 877.83 | 877.83 | ✓ |
| 2025-07 | SALE + descontos (BioAvalia) | 5,573.21 | 5,111.21 | 966.73 | 877.83 | ℹ Δcost +462.00 / Δpv +88.90 |
| 2025-08 | CONS | 3,796.00 | 3,796.00 | 766.65 | 766.65 | ✓ |
| 2025-08 | BRINDE | 134.42 | 134.42 | 21.51 | 21.51 | ✓ |
| 2025-08 | NEG | 3,023.00 | 3,023.00 | 625.90 | 625.90 | ✓ |
| 2025-08 | SALE (workbook criterion D<=0) | 4,146.55 | 4,146.55 | 696.19 | 696.19 | ✓ |
| 2025-08 | SALE + descontos (BioAvalia) | 4,500.55 | 4,146.55 | 762.49 | 696.19 | ℹ Δcost +354.00 / Δpv +66.30 |
| 2025-09 | CONS | 2,271.00 | 2,271.00 | 448.20 | 448.20 | ✓ |
| 2025-09 | BRINDE | 153.85 | 153.85 | 24.00 | 24.00 | ✓ |
| 2025-09 | NEG | 2,604.00 | 2,604.00 | 522.25 | 522.25 | ✓ |
| 2025-09 | SALE (workbook criterion D<=0) | 5,187.25 | 5,187.25 | 871.59 | 871.59 | ✓ |
| 2025-09 | SALE + descontos (BioAvalia) | 5,606.25 | 5,187.25 | 953.59 | 871.59 | ℹ Δcost +419.00 / Δpv +82.00 |
| 2025-10 | CONS | 2,355.00 | 2,355.00 | 466.75 | 466.75 | ✓ |
| 2025-10 | BRINDE | 125.79 | 125.79 | 18.04 | 18.04 | ✓ |
| 2025-10 | NEG | 4,002.00 | 4,002.00 | 825.95 | 825.95 | ✓ |
| 2025-10 | SALE (workbook criterion D<=0) | 4,791.89 | 4,791.89 | 805.02 | 805.02 | ✓ |
| 2025-10 | SALE + descontos (BioAvalia) | 5,199.89 | 4,791.89 | 884.12 | 805.02 | ℹ Δcost +408.00 / Δpv +79.10 |
| 2025-11 | CONS | 2,484.00 | 2,484.00 | 492.95 | 492.95 | ✓ |
| 2025-11 | BRINDE | 242.06 | 242.06 | 36.03 | 36.03 | ✓ |
| 2025-11 | NEG | 2,706.00 | 2,706.00 | 549.90 | 549.90 | ✓ |
| 2025-11 | SALE (workbook criterion D<=0) | 3,915.19 | 3,915.19 | 662.58 | 662.58 | ✓ |
| 2025-11 | SALE + descontos (BioAvalia) | 5,193.47 | 3,915.19 | 912.22 | 662.58 | ℹ Δcost +1,278.29 / Δpv +249.64 |
| 2025-12 | CONS | 2,261.00 | 2,261.00 | 422.05 | 422.05 | ✓ |
| 2025-12 | BRINDE | 73.77 | 73.77 | 11.53 | 11.53 | ✓ |
| 2025-12 | NEG | 1,954.00 | 1,954.00 | 423.70 | 423.70 | ✓ |
| 2025-12 | SALE (workbook criterion D<=0) | 3,507.89 | 3,507.89 | 594.42 | 594.42 | ✓ |
| 2025-12 | SALE + descontos (BioAvalia) | 4,062.89 | 3,507.89 | 704.72 | 594.42 | ℹ Δcost +555.00 / Δpv +110.30 |
| 2026-01 | CONS | 2,780.79 | 2,780.79 | 541.98 | 541.98 | ✓ |
| 2026-01 | BRINDE | 103.52 | 103.52 | 15.33 | 15.33 | ✓ |
| 2026-01 | NEG | 2,195.29 | 2,195.29 | 438.14 | 438.14 | ✓ |
| 2026-01 | SALE (workbook criterion D<=0) | 6,820.12 | 6,820.12 | 756.57 | 756.57 | ✓ |
| 2026-01 | SALE + descontos (BioAvalia) | 7,294.12 | 6,820.12 | 851.32 | 756.57 | ℹ Δcost +474.00 / Δpv +94.75 |
| 2026-02 | CONS | 2,524.87 | 2,524.87 | 485.49 | 485.49 | ✓ |
| 2026-02 | BRINDE | 202.27 | 202.27 | 25.03 | 25.03 | ✓ |
| 2026-02 | NEG | 3,577.57 | 3,577.57 | 732.07 | 732.07 | ✓ |
| 2026-02 | SALE (workbook criterion D<=0) | 8,928.57 | 8,928.57 | 870.91 | 870.91 | ✓ |
| 2026-02 | SALE + descontos (BioAvalia) | 9,325.57 | 8,928.57 | 949.36 | 870.91 | ℹ Δcost +397.00 / Δpv +78.45 |
| 2026-03 | CONS | 3,325.20 | 3,325.20 | 667.40 | 667.40 | ✓ |
| 2026-03 | BRINDE | 429.81 | 429.81 | 25.87 | 25.87 | ✓ |
| 2026-03 | NEG | 3,098.57 | 3,098.57 | 595.42 | 595.42 | ✓ |
| 2026-03 | SALE (workbook criterion D<=0) | 8,636.65 | 8,636.65 | 866.23 | 866.23 | ✓ |
| 2026-03 | SALE + descontos (BioAvalia) | 9,169.65 | 8,636.65 | 974.38 | 866.23 | ℹ Δcost +533.00 / Δpv +108.15 |
| 2026-04 | CONS | 2,145.04 | 2,145.04 | 421.35 | 421.35 | ✓ |
| 2026-04 | BRINDE | 259.58 | 259.58 | 35.78 | 35.78 | ✓ |
| 2026-04 | NEG | 4,396.00 | 4,396.00 | 926.00 | 926.00 | ✓ |
| 2026-04 | SALE (workbook criterion D<=0) | 11,266.88 | 11,266.88 | 939.17 | 939.17 | ✓ |
| 2026-04 | SALE + descontos (BioAvalia) | 12,390.88 | 11,266.88 | 1,162.72 | 939.17 | ℹ Δcost +1,124.00 / Δpv +223.55 |
| 2026-05 | CONS | 2,888.95 | 2,888.95 | 535.74 | 535.74 | ✓ |
| 2026-05 | BRINDE | 187.41 | 187.41 | 28.40 | 28.40 | ✓ |
| 2026-05 | NEG | 2,784.00 | 2,784.00 | 567.30 | 567.30 | ✓ |
| 2026-05 | SALE (workbook criterion D<=0) | 9,774.70 | 9,774.70 | 935.65 | 935.65 | ✓ |
| 2026-05 | SALE + descontos (BioAvalia) | 10,477.70 | 9,774.70 | 1,067.35 | 935.65 | ℹ Δcost +703.00 / Δpv +131.70 |
| 2026-06 | CONS | 1,635.44 | 1,635.44 | 297.91 | 297.91 | ✓ |
| 2026-06 | BRINDE | 427.82 | 427.82 | 70.04 | 70.04 | ✓ |
| 2026-06 | NEG | 2,939.00 | 2,939.00 | 560.35 | 560.35 | ✓ |
| 2026-06 | SALE (workbook criterion D<=0) | 8,940.48 | 8,940.48 | 808.67 | 808.67 | ✓ |
| 2026-06 | SALE + descontos (BioAvalia) | 9,788.48 | 8,940.48 | 971.57 | 808.67 | ℹ Δcost +848.00 / Δpv +162.90 |
| 2026-07 | CONS | 1,439.95 | 1,439.95 | 262.79 | 262.79 | ✓ |
| 2026-07 | BRINDE | 127.32 | 127.32 | 18.29 | 18.29 | ✓ |
| 2026-07 | NEG | 3,765.00 | 3,765.00 | 723.55 | 723.55 | ✓ |
| 2026-07 | SALE (workbook criterion D<=0) | 8,458.25 | 8,458.25 | 933.64 | 933.64 | ✓ |
| 2026-07 | SALE + descontos (BioAvalia) | 9,169.25 | 8,458.25 | 1,063.89 | 933.64 | ℹ Δcost +711.00 / Δpv +130.25 |
| 2026-08 | CONS | 2,223.04 | 2,223.04 | 409.25 | 409.25 | ✓ |
| 2026-08 | BRINDE | 251.25 | 251.25 | 35.71 | 35.71 | ✓ |
| 2026-08 | NEG | 3,211.00 | 3,211.00 | 584.50 | 584.50 | ✓ |
| 2026-08 | SALE (workbook criterion D<=0) | 11,333.32 | 11,333.32 | 1,017.91 | 1,017.91 | ✓ |
| 2026-08 | SALE + descontos (BioAvalia) | 11,575.32 | 11,333.32 | 1,063.86 | 1,017.91 | ℹ Δcost +242.00 / Δpv +45.95 |
| 2026-09 | CONS | 697.90 | 697.90 | 133.79 | 133.79 | ✓ |
| 2026-09 | BRINDE | 125.80 | 125.80 | 18.30 | 18.30 | ✓ |
| 2026-09 | NEG | 4,024.00 | 4,024.00 | 844.85 | 844.85 | ✓ |
| 2026-09 | SALE (workbook criterion D<=0) | 9,336.62 | 9,336.62 | 999.80 | 999.80 | ✓ |
| 2026-09 | SALE + descontos (BioAvalia) | 10,176.62 | 9,336.62 | 1,160.75 | 999.80 | ℹ Δcost +840.00 / Δpv +160.95 |
| 2026-10 | CONS | 0.00 | 0.00 | 0.00 | 0.00 | ✓ |
| 2026-10 | BRINDE | 104.81 | 104.81 | 14.99 | 14.99 | ✓ |
| 2026-10 | NEG | 1,859.00 | 1,859.00 | 404.35 | 404.35 | ✓ |
| 2026-10 | SALE (workbook criterion D<=0) | 5,160.73 | 5,160.73 | 418.35 | 418.35 | ✓ |
| 2026-10 | SALE + descontos (BioAvalia) | 5,444.73 | 5,160.73 | 473.90 | 418.35 | ℹ Δcost +284.00 / Δpv +55.55 |
| 2026-11 | CONS | 0.00 | 0.00 | 0.00 | 0.00 | ✓ |
| 2026-11 | BRINDE | 0.00 | 0.00 | 0.00 | 0.00 | ✓ |
| 2026-11 | NEG | 0.00 | 0.00 | 0.00 | 0.00 | ✓ |
| 2026-11 | SALE (workbook criterion D<=0) | 0.00 | 0.00 | 0.00 | 0.00 | ✓ |
| 2026-11 | SALE + descontos (BioAvalia) | 0.00 | 0.00 | 0.00 | 0.00 | ℹ Δcost +0.00 / Δpv +0.00 |
| 2026-12 | CONS | 0.00 | 0.00 | 0.00 | 0.00 | ✓ |
| 2026-12 | BRINDE | 0.00 | 0.00 | 0.00 | 0.00 | ✓ |
| 2026-12 | NEG | 0.00 | 0.00 | 0.00 | 0.00 | ✓ |
| 2026-12 | SALE (workbook criterion D<=0) | 0.00 | 0.00 | 0.00 | 0.00 | ✓ |
| 2026-12 | SALE + descontos (BioAvalia) | 0.00 | 0.00 | 0.00 | 0.00 | ℹ Δcost +0.00 / Δpv +0.00 |
| 2027-01 | CONS | 0.00 | 0.00 | 0.00 | 0.00 | ✓ |
| 2027-01 | BRINDE | 0.00 | 0.00 | 0.00 | 0.00 | ✓ |
| 2027-01 | NEG | 0.00 | 0.00 | 0.00 | 0.00 | ✓ |
| 2027-01 | SALE (workbook criterion D<=0) | 0.00 | 0.00 | 0.00 | 0.00 | ✓ |
| 2027-01 | SALE + descontos (BioAvalia) | 0.00 | 0.00 | 0.00 | 0.00 | ℹ Δcost +0.00 / Δpv +0.00 |

Strict comparisons checked: 100 — all passed: True

### Consolidado spot check (informational)

`D` carries an activity **count** pulled from `MDO-Mês` despite its "Total Vendas" header; `J` sums CONS+BRINDE+NEG PV plus a manual MDO PV column and deliberately excludes the ledger's plain-sale PV. Neither column is comparable to revenue — listed here for the record only.

| month | revenue recomputed | D cached (count, not revenue) | PV recomputed (ledger total) | J cached (PV excl. vendas) |
|-------|--------------------|-------------------------------|------------------------------|----------------------------|
| 2025-01 | 9,862.00 | 31.0 | 2,506.39 | 1879.1499999999996 |
| 2025-02 | 9,134.50 | 16.0 | 2,678.81 | 1483.5367857142858 |
| 2025-03 | 10,839.00 | 23.0 | 2,872.10 | 2055.031904761905 |
| 2025-04 | 7,136.00 | 6.0 | 2,691.30 | 1443.2285714285715 |
| 2025-05 | 12,451.00 | 22.0 | 2,600.87 | 1693.5609956709957 |
| 2025-06 | 9,926.50 | 19.0 | 2,426.60 | 1350.8785714285714 |
| 2025-07 | 11,673.00 | 14.0 | 2,563.80 | 1765.9759199134198 |
| 2025-08 | 7,494.00 | 8.0 | 3,409.55 | 1587.910519480519 |
| 2025-09 | 11,763.50 | 12.0 | 2,469.78 | 1249.7989718614717 |
| 2025-10 | 9,921.00 | 9.0 | 2,256.76 | 1518.588452380952 |
| 2025-11 | 10,670.57 | 22.0 | 2,372.70 | 1491.181352813853 |
| 2025-12 | 6,183.50 | 12.0 | 1,666.49 | 1122.1765043290043 |
| 2026-01 | 9,430.00 | 21.0 | 1,857.52 | 1373.7950730519478 |

### Conclusion

✅ **ETL is faithful.** All 100 strict comparisons against the workbook's own cached aggregates match exactly (25 months × CONS / BRINDE / NEG / SALE-by-workbook-criterion).

Explained differences — source-workbook quirks, **not** data loss:
- **SALE**: the workbook's `SUMIFS(D:D,"<=0")` counts only rows whose deal cell is numeric 0; discount-coded sales (0.14/0.23/0.25/0.32/0.35/0.42/0.5) fall out of every bucket. BioAvalia includes them in the sales top line (more complete); the ℹ delta above is exactly those rows.
- **Consolidado D/J**: see the informational table — header/values mismatch in the source sheet, verified row by row against the imported data.
