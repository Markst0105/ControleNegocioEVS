-- BioAvalia ETL seed — generated from Controle do Negócio 2026-10.xlsx
-- Review before loading; do not load twice without cleaning.

insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ('$', 'Dinheiro', 'cash', 0, 0) on conflict (code) do nothing;
insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ('P', 'PIX', 'pix', 0, 0) on conflict (code) do nothing;
insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ('D', 'Débito', 'debit', 0, 0) on conflict (code) do nothing;
insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ('TK', 'Cartela', 'ticket', 0, 0) on conflict (code) do nothing;
insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ('VR', 'Vale Refeição', 'voucher', 0, 0) on conflict (code) do nothing;
insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ('AL', 'Alelo', 'voucher', 0, 0) on conflict (code) do nothing;
insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ('SX', 'Sodexo', 'voucher', 0, 0) on conflict (code) do nothing;
insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ('TR', 'Ticket Restaurante', 'voucher', 0, 0) on conflict (code) do nothing;
insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ('1', 'Crédito 1x', 'credit', 0, 30) on conflict (code) do nothing;
insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ('2', 'Crédito 2x', 'credit', 0, 60) on conflict (code) do nothing;
insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ('3', 'Crédito 3x', 'credit', 0, 90) on conflict (code) do nothing;
insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ('NP', 'Não pagou', 'exception', 0, 0) on conflict (code) do nothing;
insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ('NTT', 'Não trouxe ticket', 'exception', 0, 0) on conflict (code) do nothing;
insert into deal_types (code, label, kind, affects_revenue, affects_pv, affects_stock) values ('0', 'Venda (sem desconto)', 'sale', true, true, true) on conflict (code) do nothing;
insert into deal_types (code, label, kind, affects_revenue, affects_pv, affects_stock) values ('CONS', 'Consumo próprio', 'consumo', false, false, false) on conflict (code) do nothing;
insert into deal_types (code, label, kind, affects_revenue, affects_pv, affects_stock) values ('NEG', 'Negócio', 'negocio', true, true, false) on conflict (code) do nothing;
insert into deal_types (code, label, kind, affects_revenue, affects_pv, affects_stock) values ('BRINDE', 'Brinde', 'brinde', false, false, false) on conflict (code) do nothing;
insert into deal_types (code, label, kind, affects_revenue, affects_pv, affects_stock) values ('LEVOU', 'Empréstimo (saída)', 'loan_out', false, false, true) on conflict (code) do nothing;
insert into deal_types (code, label, kind, affects_revenue, affects_pv, affects_stock) values ('TROUXE', 'Devolução', 'return', false, false, true) on conflict (code) do nothing;
insert into deal_types (code, label, kind, affects_revenue, affects_pv, affects_stock) values ('DESC', 'Desconto', 'discount', true, true, true) on conflict (code) do nothing;
insert into deal_types (code, label, kind, affects_revenue, affects_pv, affects_stock) values ('pga', 'Pagamento acesso', 'financial', true, false, false) on conflict (code) do nothing;
insert into item_classes (code, label, family, is_financial_only) values ('N.I', 'Nutrição Interna', 'N.I', false) on conflict (code) do nothing;
insert into item_classes (code, label, family, is_financial_only) values ('N.E', 'Nutrição Externa', 'N.E', false) on conflict (code) do nothing;
insert into item_classes (code, label, family, is_financial_only) values ('E.A', 'Espaço / Acesso', 'E.A', false) on conflict (code) do nothing;
insert into item_classes (code, label, family, is_financial_only) values ('E.X', 'Espaço Extra', 'E.X', false) on conflict (code) do nothing;
insert into item_classes (code, label, family, is_financial_only) values ('E.AC', 'Espaço Acesso Cartela', 'E.A', false) on conflict (code) do nothing;
insert into item_classes (code, label, family, is_financial_only) values ('E.AF', 'Espaço Acesso Financeiro', 'E.A', true) on conflict (code) do nothing;
insert into item_classes (code, label, family, is_financial_only) values ('N.IF', 'Nutrição Interna Financeira', 'N.I', true) on conflict (code) do nothing;
insert into locations (code, label) values ('EVS', 'Espaço Mooca') on conflict (code) do nothing;
insert into locations (code, label) values ('CASA', 'Casa') on conflict (code) do nothing;
insert into locations (code, label) values ('MALA', 'Mala') on conflict (code) do nothing;
insert into locations (code, label) values ('BUFFER', 'Buffer') on conflict (code) do nothing;

