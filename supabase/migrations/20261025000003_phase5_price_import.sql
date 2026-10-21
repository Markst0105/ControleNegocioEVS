-- ============================================================================
-- Phase 5 — import prices from a spreadsheet
--
-- The Preços screen can load a "Novos Preços HLF" shaped sheet. The Node
-- side parses the file and calls this function with the rows; the database
-- matches the SKUs, keeps the price history and writes an audit entry.
--
-- Rules:
--   * only an admin may import;
--   * a price that did not change is left alone;
--   * a changed price closes the current row (valid_to) and opens a new one
--     with valid_from = the chosen date — the history is never overwritten;
--   * the product name and PV are updated when the sheet carries them;
--   * SKUs that are not in the catalog are reported, not created.
-- ============================================================================

create or replace function public.import_price_sheet(
    p_rows jsonb,
    p_valid_from date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_row jsonb;
    v_sku text;
    v_name text;
    v_pv numeric;
    v_tier text;
    v_price numeric;
    v_product public.products%rowtype;
    v_current public.product_prices%rowtype;
    v_matched int := 0;
    v_unknown text[] := '{}';
    v_prices_changed int := 0;
    v_prices_unchanged int := 0;
    v_names_changed int := 0;
    v_pv_changed int := 0;
    v_valid_from date;
    v_summary jsonb;
begin
    if current_user_role() <> 'admin' then
        raise exception 'Apenas administradores podem importar preços.'
            using errcode = '42501';
    end if;

    if p_rows is null or jsonb_typeof(p_rows) <> 'array'
       or jsonb_array_length(p_rows) = 0 then
        raise exception 'Envie ao menos uma linha de preços.'
            using errcode = '22023';
    end if;

    v_valid_from := coalesce(p_valid_from, public.business_today());
    if v_valid_from > public.business_today() then
        raise exception 'A data de validade não pode estar no futuro.'
            using errcode = '22023';
    end if;

    for v_row in select value from jsonb_array_elements(p_rows) loop
        v_sku := btrim(coalesce(v_row ->> 'sku', ''));
        if v_sku = '' then
            continue;
        end if;

        select * into v_product
        from public.products p
        where lower(btrim(p.sku)) = lower(v_sku)
        order by p.is_active desc nulls last, p.id
        limit 1;

        if not found then
            v_unknown := v_unknown || v_sku;
            continue;
        end if;

        v_matched := v_matched + 1;

        v_name := nullif(btrim(coalesce(v_row ->> 'name', '')), '');
        if v_name is not null and v_name is distinct from v_product.name then
            update public.products
            set name = v_name, updated_at = now()
            where id = v_product.id;
            v_names_changed := v_names_changed + 1;
        end if;

        if nullif(v_row ->> 'pv', '') is not null then
            v_pv := (v_row ->> 'pv')::numeric;
            if v_pv is distinct from v_product.pv then
                update public.products
                set pv = v_pv, updated_at = now()
                where id = v_product.id;
                v_pv_changed := v_pv_changed + 1;
            end if;
        end if;

        for v_tier, v_price in
            select key, value::numeric
            from jsonb_each_text(coalesce(v_row -> 'prices', '{}'::jsonb))
            where value is not null
              and btrim(value) <> ''
        loop
            select * into v_current
            from public.product_prices pp
            where pp.product_id = v_product.id
              and pp.tier_code = v_tier
              and pp.valid_from <= v_valid_from
              and (pp.valid_to is null or pp.valid_to >= v_valid_from)
            order by pp.valid_from desc
            limit 1;

            if found and v_current.price = v_price then
                v_prices_unchanged := v_prices_unchanged + 1;
                continue;
            end if;

            if found and v_current.valid_from = v_valid_from then
                update public.product_prices
                set price = v_price, valid_to = null
                where id = v_current.id;
            else
                if found then
                    update public.product_prices
                    set valid_to = v_valid_from - 1
                    where id = v_current.id;
                end if;

                insert into public.product_prices (
                    product_id, tier_code, price, valid_from
                )
                values (v_product.id, v_tier, v_price, v_valid_from)
                on conflict (product_id, tier_code, valid_from)
                do update set price = excluded.price, valid_to = null;
            end if;

            v_prices_changed := v_prices_changed + 1;
        end loop;
    end loop;

    v_summary := jsonb_build_object(
        'products', v_matched,
        'prices_changed', v_prices_changed,
        'prices_unchanged', v_prices_unchanged,
        'names_changed', v_names_changed,
        'pv_changed', v_pv_changed,
        'unknown_skus', to_jsonb(v_unknown),
        'valid_from', v_valid_from
    );

    insert into public.audit_log (table_name, action, new_data, changed_by)
    values ('price_import', 'update', v_summary, auth.uid());

    return v_summary;
end;
$$;

comment on function public.import_price_sheet(jsonb, date) is
    'Applies a price sheet: updates the product prices from the given rows and returns a summary.';

revoke all on function public.import_price_sheet(jsonb, date) from public;
grant execute on function public.import_price_sheet(jsonb, date) to authenticated;

notify pgrst, 'reload schema';
