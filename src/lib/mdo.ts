export type MdoField =
  | "contatos"
  | "ligacao"
  | "marcacao"
  | "apresentacao"
  | "indicacoes"
  | "convites_traga_um"
  | "cliente_novo"
  | "cliente_repetidor"
  | "acesso_total"
  | "cartelas"
  | "cortesias"
  | "consumo_proprio"
  | "panfletos"
  | "convidados_hom"
  | "convidados_jantar"
  | "convidados_qs"
  | "convidados_sts"
  | "indicacoes_recru"
  | "novos_consultores"
  | "novos_cons_sr"
  | "novos_const_sucesso"
  | "novos_supervisores";

export type MdoFieldDefinition = {
  name: MdoField;
  label: string;
  shortLabel: string;
};

export type MdoGroup = {
  key: string;
  title: string;
  description: string;
  fields: MdoFieldDefinition[];
};

export const MDO_GROUPS: MdoGroup[] = [
  {
    key: "activities",
    title: "Atividades",
    description: "O que foi feito no dia, do primeiro contato ao convite.",
    fields: [
      { name: "contatos", label: "Contatos", shortLabel: "Contatos" },
      { name: "ligacao", label: "Ligações", shortLabel: "Ligações" },
      { name: "marcacao", label: "Marcações", shortLabel: "Marcações" },
      { name: "apresentacao", label: "Apresentações", shortLabel: "Apres." },
      { name: "indicacoes", label: "Indicações", shortLabel: "Indicações" },
      {
        name: "convites_traga_um",
        label: 'Convites "traga um"',
        shortLabel: "Traga um",
      },
      { name: "panfletos", label: "Panfletos", shortLabel: "Panfletos" },
    ],
  },
  {
    key: "clients",
    title: "Clientes",
    description: "Acessos, consumo e movimento de clientes no dia.",
    fields: [
      { name: "cliente_novo", label: "Novos clientes", shortLabel: "Novos" },
      {
        name: "cliente_repetidor",
        label: "Clientes repetidores",
        shortLabel: "Repetidores",
      },
      { name: "acesso_total", label: "Acessos", shortLabel: "Acessos" },
      { name: "cartelas", label: "Cartelas (créditos)", shortLabel: "Cartelas" },
      { name: "cortesias", label: "Cortesias", shortLabel: "Cortesias" },
      {
        name: "consumo_proprio",
        label: "Consumo próprio",
        shortLabel: "Consumo",
      },
    ],
  },
  {
    key: "recruiting",
    title: "Recrutamento",
    description: "Convidados, indicações e novos consultores.",
    fields: [
      { name: "convidados_hom", label: "Convidados HOM", shortLabel: "HOM" },
      {
        name: "convidados_jantar",
        label: "Convidados jantar",
        shortLabel: "Jantar",
      },
      { name: "convidados_qs", label: "Convidados QS", shortLabel: "QS" },
      { name: "convidados_sts", label: "Convidados STS", shortLabel: "STS" },
      {
        name: "indicacoes_recru",
        label: "Indicações de recrutamento",
        shortLabel: "Indicações",
      },
      {
        name: "novos_consultores",
        label: "Novos consultores",
        shortLabel: "Consultores",
      },
      {
        name: "novos_cons_sr",
        label: "Novos consultores SR",
        shortLabel: "Cons. SR",
      },
      {
        name: "novos_const_sucesso",
        label: "Novos const. sucesso",
        shortLabel: "Sucesso",
      },
      {
        name: "novos_supervisores",
        label: "Novos supervisores",
        shortLabel: "Supervisores",
      },
    ],
  },
];

export const MDO_FIELDS: MdoFieldDefinition[] = MDO_GROUPS.flatMap(
  (group) => group.fields,
);

export const MDO_FIELD_BY_NAME = new Map(
  MDO_FIELDS.map((field) => [field.name, field]),
);

export const MDO_SUMMARY_FIELDS: MdoFieldDefinition[] = [
  MDO_FIELD_BY_NAME.get("acesso_total")!,
  MDO_FIELD_BY_NAME.get("cliente_novo")!,
  MDO_FIELD_BY_NAME.get("cliente_repetidor")!,
  MDO_FIELD_BY_NAME.get("contatos")!,
  MDO_FIELD_BY_NAME.get("novos_supervisores")!,
];

export type MdoDay = Record<MdoField, number | null> & {
  kpi_date: string;
};

export function mdoTotal(rows: MdoDay[], field: MdoField): number {
  return rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
}
