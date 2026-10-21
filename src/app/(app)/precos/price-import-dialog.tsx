"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatInt, todayISO } from "@/lib/format";

type ImportSummary = {
  products: number;
  prices_changed: number;
  prices_unchanged: number;
  names_changed: number;
  pv_changed: number;
  unknown_skus: string[];
  valid_from: string;
};

type ImportResponse = {
  summary?: ImportSummary;
  sheet?: string;
  skipped?: { row: number; reason: string }[];
  unknownHeaders?: string[];
  duplicateSkus?: string[];
  error?: string;
};

/**
 * Loads a price spreadsheet shaped like the workbook's "Novos Preços HLF" tab
 * and applies it to the catalog. Admin only.
 */
export function PriceImportDialog() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = formRef.current;
    if (!form) return;

    const data = new FormData(form);
    setIsPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/precos/importar", {
        method: "POST",
        body: data,
      });
      if (response.redirected) {
        setResult({
          error: "Sua sessão expirou. Entre novamente para continuar.",
        });
        return;
      }
      const payload = (await response.json()) as ImportResponse;
      setResult(payload);
      if (response.ok) {
        router.refresh();
      }
    } catch {
      setResult({ error: "Não foi possível enviar a planilha." });
    } finally {
      setIsPending(false);
    }
  }

  const summary = result?.summary;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9">
          <Upload />
          Atualizar preços
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-[22px] font-normal">
            Atualizar preços pela planilha
          </DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed text-ink-soft">
            Envie uma planilha no formato da aba <strong>Novos Preços HLF</strong>:
            colunas SKU, Produto, PV, Venda, 0.25, 0.35, 0.42, 0.5, Bronze,
            Prata e Ouro. Os SKUs são conferidos pelo catálogo; preços novos
            passam a valer na data escolhida e o histórico anterior é
            preservado.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="import-arquivo">Planilha</Label>
            <Input
              id="import-arquivo"
              name="arquivo"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              className="h-10"
              onChange={(event) =>
                setFileName(event.target.files?.[0]?.name ?? null)
              }
            />
            <p className="text-[11px] text-ink-soft">
              {fileName
                ? `${fileName} · aba ${
                    result?.sheet ?? "será detectada automaticamente"
                  }`
                : "Arquivo .xlsx de até 4 MB — exporte apenas a aba de preços."}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="import-validade">Válido a partir de</Label>
            <Input
              id="import-validade"
              name="validade"
              type="date"
              defaultValue={todayISO()}
              max={todayISO()}
              required
              className="num h-10"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending}>
              <FileSpreadsheet />
              {isPending ? "Importando…" : "Importar preços"}
            </Button>
          </div>

          {result?.error ? (
            <p
              role="alert"
              className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-sm text-rust-ink"
            >
              {result.error}
            </p>
          ) : null}

          {summary ? (
            <div className="grid gap-2 rounded-md border border-line bg-surface px-3 py-3 text-[12px] leading-relaxed">
              <p className="font-medium">
                {formatInt(summary.products)}{" "}
                {summary.products === 1 ? "produto encontrado" : "produtos encontrados"}{" "}
                · válidos desde {formatDate(summary.valid_from)}
              </p>
              <p className="text-ink-soft">
                {formatInt(summary.prices_changed)} preços atualizados ·{" "}
                {formatInt(summary.prices_unchanged)} mantidos
                {summary.names_changed > 0
                  ? ` · ${formatInt(summary.names_changed)} nomes ajustados`
                  : ""}
                {summary.pv_changed > 0
                  ? ` · ${formatInt(summary.pv_changed)} PVs ajustados`
                  : ""}
              </p>
              {summary.unknown_skus.length > 0 ? (
                <p className="text-ink-soft">
                  SKUs fora do catálogo ({summary.unknown_skus.length}):{" "}
                  {summary.unknown_skus.slice(0, 12).join(", ")}
                  {summary.unknown_skus.length > 12 ? "…" : ""}
                </p>
              ) : null}
              {result?.skipped && result.skipped.length > 0 ? (
                <p className="text-ink-soft">
                  {formatInt(result.skipped.length)} linhas ignoradas:{" "}
                  {result.skipped
                    .slice(0, 5)
                    .map((item) => `linha ${item.row} (${item.reason})`)
                    .join(", ")}
                  {result.skipped.length > 5 ? "…" : ""}
                </p>
              ) : null}
            </div>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
