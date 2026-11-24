-- T-05a · Idempotencia (AC-05.4), autor e historial con stock acumulado (AC-05.3).

-- ---------------------------------------------------------------------------
-- stock_movements: clave de idempotencia y autor
-- ---------------------------------------------------------------------------
-- request_id lo genera el servidor al pintar la ficha. Es nullable: los
-- movimientos anteriores y las llamadas sin clave no son idempotentes. En un
-- unique, los null no chocan entre sí. La unicidad es por workspace.
-- created_by_email se copia en el alta: el historial muestra el autor sin leer
-- auth.users (que authenticated no puede consultar) y sobrevive al borrado del usuario.
-- Sin grants nuevos: los movimientos siguen siendo inmutables (D-02), solo
-- register_movement() inserta.
alter table public.stock_movements
  add column request_id uuid,
  add column created_by_email text,
  add constraint stock_movements_request_id_key unique (workspace_id, request_id);

-- ---------------------------------------------------------------------------
-- Texto en blanco y longitud (D-04)
-- ---------------------------------------------------------------------------
-- Los checks de T-01 usan btrim(), que solo quita espacios ' ': un tabulador o un
-- salto de línea pasaban, mientras que el trim de zod (JS) los rechaza.
--
-- has_visible_text() replica exactamente String.prototype.trim de JS: tabulador,
-- salto de línea, VT, FF, retorno, espacio, NBSP, U+1680, U+2000-U+200A, U+2028,
-- U+2029, U+202F, U+205F, U+3000 y BOM (U+FEFF). No usa [:space:] ni btrim()
-- porque [:space:] depende de la collation de la base de datos (con libc o "C" no
-- reconoce NBSP ni U+3000, nunca el BOM, y trata U+0085 como blanco), y la regla
-- no puede variar con cómo esté creada la BD. Los escapes de la forma \uXXXX los
-- interpreta el motor de regex de Postgres (con standard_conforming_strings = on
-- la barra llega intacta al literal).
-- Es immutable y pura, sin security definer: los checks la evalúan con el rol que
-- escribe, así que conserva el EXECUTE por defecto.
create function public.has_visible_text(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p ~ '[^\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]';
$$;

-- Filas previas: products es mutable, así que las que incumplan se normalizan antes
-- (como en zod: sin nombre no hay producto; la unidad por defecto es 'ud'). Los
-- movimientos son inmutables (D-02): el check de la nota se añade NOT VALID, que se
-- aplica a toda fila nueva sin reescribir ni rechazar el historial existente.
update public.products set name = 'Sin nombre' where not public.has_visible_text(name);
update public.products set unit = 'ud' where not public.has_visible_text(unit);

alter table public.products
  drop constraint products_name_check,
  drop constraint products_unit_check,
  add constraint products_name_not_blank check (public.has_visible_text(name)),
  add constraint products_unit_not_blank check (public.has_visible_text(unit));

alter table public.stock_movements
  drop constraint stock_movements_adjust_requires_note,
  add constraint stock_movements_adjust_requires_note check (
    kind <> 'adjust' or public.has_visible_text(coalesce(note, ''))
  ) not valid,
  -- Debe coincidir con movementSchema (500).
  add constraint stock_movements_note_length check (char_length(note) <= 500) not valid;

-- ---------------------------------------------------------------------------
-- register_movement con p_request_id
-- ---------------------------------------------------------------------------
drop function public.register_movement(uuid, public.movement_kind, integer, text);

-- Mismo comportamiento que en T-01, más: p_kind null → invalid_kind, e
-- idempotencia por p_request_id. Con 4 argumentos sigue resolviendo (default null).
create function public.register_movement(
  p_product_id uuid,
  p_kind public.movement_kind,
  p_quantity integer,
  p_note text default null,
  p_request_id uuid default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_product public.products;
  v_current bigint;
  v_movement public.stock_movements;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Errores (errcode, mensaje): not_authenticated (28000), invalid_kind (P0001),
  -- idempotency_conflict (P0001), invalid_quantity_sign (P0001), product_not_found (P0002), product_archived
  -- (P0001) e insufficient_stock (P0001, con el stock actual en DETAIL).
  -- Con p_kind null, las comparaciones de abajo dan null y no rechazarían nada:
  -- se corta aquí.
  if p_kind is null then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;

  -- Signo según tipo, validado antes de mirar el stock: in > 0, out < 0,
  -- adjust cualquier signo salvo 0. Los checks de la tabla lo repiten.
  if p_quantity is null
     or p_quantity = 0
     or (p_kind = 'in' and p_quantity < 0)
     or (p_kind = 'out' and p_quantity > 0) then
    raise exception 'invalid_quantity_sign' using errcode = 'P0001';
  end if;

  -- Pertenencia y bloqueo en una sola consulta: un no miembro no ve el
  -- producto, así que ni siquiera puede bloquearlo.
  select p.* into v_product
  from public.products p
  where p.id = p_product_id
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = p.workspace_id and wm.user_id = v_uid
    )
  for update of p;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  -- Idempotencia (AC-05.4). Se comprueba con la fila del producto ya bloqueada:
  -- dos peticiones concurrentes con la misma clave se serializan en el for update,
  -- así la segunda ve el movimiento que insertó la primera y lo devuelve en vez
  -- de duplicarlo o de chocar con el unique. Va antes del archivado y del stock:
  -- un reintento de algo ya registrado debe devolver el original aunque después
  -- el producto se haya archivado o el stock haya cambiado. El unique
  -- (workspace_id, request_id) es la red de seguridad.
  if p_request_id is not null then
    select m.* into v_movement
    from public.stock_movements m
    where m.workspace_id = v_product.workspace_id
      and m.request_id = p_request_id;

    if found then
      -- La misma clave con otra petición (otro producto, tipo, cantidad o nota) no es
      -- un reintento: devolver el movimiento ajeno haría creer que se registró.
      if v_movement.product_id <> v_product.id
         or v_movement.kind <> p_kind
         or v_movement.quantity <> p_quantity
         or v_movement.note is distinct from p_note then
        raise exception 'idempotency_conflict' using errcode = 'P0001';
      end if;
      return v_movement;
    end if;
  end if;

  if v_product.archived_at is not null then
    raise exception 'product_archived' using errcode = 'P0001';
  end if;

  select coalesce(sum(m.quantity), 0) into v_current
  from public.stock_movements m
  where m.product_id = v_product.id;

  if v_current + p_quantity < 0 then
    raise exception 'insufficient_stock' using errcode = 'P0001', detail = v_current::text;
  end if;

  -- El workspace sale del producto, nunca del llamante. Los checks de la
  -- tabla validan quantity y signo según el tipo.
  insert into public.stock_movements
    (workspace_id, product_id, kind, quantity, note, created_by, created_by_email, request_id)
  values (
    v_product.workspace_id, v_product.id, p_kind, p_quantity, p_note, v_uid,
    (select u.email from auth.users u where u.id = v_uid),
    p_request_id
  )
  returning * into v_movement;

  return v_movement;
end;
$$;
revoke all on function public.register_movement(uuid, public.movement_kind, integer, text, uuid)
  from public, anon;
grant execute on function public.register_movement(uuid, public.movement_kind, integer, text, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Historial con stock acumulado
-- ---------------------------------------------------------------------------
-- security_invoker (S-04): aplica la RLS de stock_movements a quien consulta.
-- Desempate por id para que el acumulado sea determinista con created_at iguales.
create view public.movement_history
  with (security_invoker = true) as
select
  m.id,
  m.workspace_id,
  m.product_id,
  m.kind,
  m.quantity,
  m.note,
  m.created_by_email,
  m.created_at,
  sum(m.quantity) over (
    partition by m.product_id
    order by m.created_at, m.id
    rows between unbounded preceding and current row
  )::bigint as running_stock
from public.stock_movements m;

-- Los default privileges de Supabase conceden de más: se quita todo y se da solo select.
revoke all on table public.movement_history from public, anon, authenticated;
grant select on table public.movement_history to authenticated;
