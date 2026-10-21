"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Texto extra usado na busca (ex.: SKU do produto). */
  search?: string;
  /** Texto curto à direita do item (ex.: PV). */
  hint?: string;
};

export function Combobox({
  name,
  options,
  placeholder = "Selecionar…",
  searchPlaceholder = "Buscar…",
  emptyText = "Nada encontrado.",
  defaultValue = "",
  onValueChange,
  allowClear = false,
  id,
}: {
  name: string;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  allowClear?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  function setSelection(next: string) {
    setValue(next);
    onValueChange?.(next);
    setOpen(false);
  }

  return (
    <div className="relative min-w-0">
      <input type="hidden" name={name} value={value} />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            title={selected?.label ?? placeholder}
            className={cn(
              "h-10 w-full min-w-0 justify-between gap-2 overflow-hidden bg-surface px-3 font-normal",
              !selected && "text-ink-soft",
            )}
          >
            <span className="min-w-0 flex-1 truncate text-left">
              {selected ? selected.label : placeholder}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-64 p-0"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList className="max-h-64">
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.search ?? ""}`}
                    onSelect={() => {
                      if (allowClear && option.value === value) {
                        setSelection("");
                      } else {
                        setSelection(option.value);
                      }
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="num shrink-0 text-[11px] text-ink-soft">
                        {option.hint}
                      </span>
                    ) : null}
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {allowClear && selected ? (
        <button
          type="button"
          aria-label="Limpar seleção"
          onClick={() => setSelection("")}
          className="absolute top-1/2 right-9 -translate-y-1/2 rounded-sm p-0.5 text-ink-soft transition-colors hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
