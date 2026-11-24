-- T-01 · Esquema, RLS y funciones de Kardex.
-- El stock NO se almacena: es la suma de stock_movements (ADR-0002).

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'member');
create type public.movement_kind as enum ('in', 'out', 'adjust');

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  primary key (workspace_id, user_id)
);
-- Para resolver "mis workspaces" por usuario (is_member filtra por user_id).
create index workspace_members_user_id_idx on public.workspace_members (user_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  sku text not null check (length(btrim(sku)) > 0),
  name text not null check (length(btrim(name)) > 0),
  unit text not null default 'ud' check (length(btrim(unit)) > 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, sku),
  -- Permite la FK compuesta de stock_movements: un movimiento no puede apuntar
  -- a un producto de otro workspace.
  unique (id, workspace_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  product_id uuid not null,
  kind public.movement_kind not null,
  quantity integer not null check (quantity <> 0),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- NO ACTION (explícito): no se puede borrar un producto con historial; el
  -- borrado en cascada desde el workspace sí funciona (se comprueba al final).
  foreign key (product_id, workspace_id)
    references public.products (id, workspace_id) on delete no action,
  -- in > 0, out < 0, adjust cualquier signo salvo 0.
  constraint stock_movements_sign_by_kind check (
    (kind = 'in' and quantity > 0)
    or (kind = 'out' and quantity < 0)
    or (kind = 'adjust')
  ),
  -- Un ajuste corrige un error: debe explicarse.
  constraint stock_movements_adjust_requires_note check (
    kind <> 'adjust' or length(btrim(coalesce(note, ''))) > 0
  )
);
create index stock_movements_product_id_idx on public.stock_movements (product_id);
create index stock_movements_workspace_created_idx
  on public.stock_movements (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Vista de stock (S-04: security_invoker para respetar la RLS de las tablas)
-- ---------------------------------------------------------------------------
create view public.product_stock
  with (security_invoker = true) as
select
  p.id,
  p.workspace_id,
  p.sku,
  p.name,
  p.unit,
  p.min_stock,
  p.archived_at,
  p.created_at,
  coalesce(sum(m.quantity), 0)::bigint as stock
from public.products p
left join public.stock_movements m on m.product_id = p.id
group by p.id;

-- ---------------------------------------------------------------------------
-- Funciones
-- ---------------------------------------------------------------------------

-- security definer para consultar workspace_members sin recursión de RLS
-- (las políticas de workspace_members usan esta misma función).
create function public.is_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;

-- Alta: cada usuario nuevo recibe un workspace y es su owner (AC-01.4).
-- security definer porque las tablas no admiten insert directo.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  insert into public.workspaces (name)
  -- left(..., 100): el nombre del workspace admite 120 caracteres como máximo y
  -- la parte local de un email puede ser más larga; no debe abortar el alta.
  values ('Almacén de ' || left(coalesce(nullif(split_part(new.email, '@', 1), ''), 'usuario'), 100))
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, new.id, 'owner');

  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Único camino para crear movimientos (D-03). security definer porque
-- stock_movements no tiene política de insert; por eso valida la pertenencia
-- él mismo. Bloquea la fila del producto con for update, de modo que dos
-- movimientos concurrentes del mismo producto se serializan.
create function public.register_movement(
  p_product_id uuid,
  p_kind public.movement_kind,
  p_quantity integer,
  p_note text default null
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

  -- Errores (errcode, mensaje): not_authenticated (28000), invalid_quantity_sign
  -- (P0001), product_not_found (P0002), product_archived (P0001) e
  -- insufficient_stock (P0001, con el stock actual en DETAIL).
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
    (workspace_id, product_id, kind, quantity, note, created_by)
  values
    (v_product.workspace_id, v_product.id, p_kind, p_quantity, p_note, v_uid)
  returning * into v_movement;

  return v_movement;
end;
$$;
revoke all on function public.register_movement(uuid, public.movement_kind, integer, text)
  from public, anon;
grant execute on function public.register_movement(uuid, public.movement_kind, integer, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Privilegios (defensa en profundidad además de la RLS)
-- ---------------------------------------------------------------------------
-- Mínimo privilegio: se quita todo y se concede solo lo que las políticas
-- permiten. Importa sobre todo para TRUNCATE, que se salta la RLS y la
-- inmutabilidad de stock_movements.
revoke all on table public.workspaces, public.workspace_members, public.products,
  public.stock_movements, public.product_stock from anon, authenticated;

grant select, update on table public.workspaces to authenticated;
grant select on table public.workspace_members to authenticated;
grant select, insert, update on table public.products to authenticated;
-- Los movimientos solo se crean con register_movement() (security definer).
grant select on table public.stock_movements to authenticated;
grant select on table public.product_stock to authenticated;

-- Tablas futuras: que Supabase no vuelva a conceder TRUNCATE por defecto.
alter default privileges in schema public revoke truncate on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS (S-02): activada y con política explícita por operación.
-- Las operaciones denegadas a propósito llevan `using (false)` / `with check (false)`.
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

-- workspaces
create policy workspaces_select on public.workspaces
  for select to authenticated using (public.is_member(id));
-- insert denegado: solo el trigger de alta crea workspaces.
create policy workspaces_insert on public.workspaces
  for insert to authenticated with check (false);
create policy workspaces_update on public.workspaces
  for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));
-- delete denegado: en v1 no se borran workspaces desde la app.
create policy workspaces_delete on public.workspaces
  for delete to authenticated using (false);

-- workspace_members
create policy workspace_members_select on public.workspace_members
  for select to authenticated using (public.is_member(workspace_id));
-- insert/update/delete denegados: fuera de v1 (invitaciones); la membresía
-- owner la crea el trigger de alta.
create policy workspace_members_insert on public.workspace_members
  for insert to authenticated with check (false);
create policy workspace_members_update on public.workspace_members
  for update to authenticated using (false) with check (false);
create policy workspace_members_delete on public.workspace_members
  for delete to authenticated using (false);

-- products
create policy products_select on public.products
  for select to authenticated using (public.is_member(workspace_id));
create policy products_insert on public.products
  for insert to authenticated with check (public.is_member(workspace_id));
-- with check impide mover un producto a un workspace ajeno.
create policy products_update on public.products
  for update to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
-- delete denegado: los productos se archivan (archived_at) para conservar el historial.
create policy products_delete on public.products
  for delete to authenticated using (false);

-- stock_movements
create policy stock_movements_select on public.stock_movements
  for select to authenticated using (public.is_member(workspace_id));
-- insert denegado: solo register_movement() (security definer) inserta (D-03).
create policy stock_movements_insert on public.stock_movements
  for insert to authenticated with check (false);
-- update/delete denegados: los movimientos son inmutables (D-02, ADR-0002).
create policy stock_movements_update on public.stock_movements
  for update to authenticated using (false) with check (false);
create policy stock_movements_delete on public.stock_movements
  for delete to authenticated using (false);
