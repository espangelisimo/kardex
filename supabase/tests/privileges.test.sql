-- T-01 ronda 2 · Mínimo privilegio, TRUNCATE, signo por tipo y alta con email largo.
begin;
select plan(31);

-- C: alta normal. D: email con parte local de 200 caracteres.
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'c@example.com'),
  ('dddddddd-0000-0000-0000-000000000002', repeat('x', 200) || '@example.com');

-- handle_new_user no debe fallar con emails largos (name <= 120).
select is(
  (select w.name from public.workspaces w
     join public.workspace_members m on m.workspace_id = w.id
    where m.user_id = 'dddddddd-0000-0000-0000-000000000002'),
  'Almacén de ' || repeat('x', 100),
  'el alta con email largo crea el workspace con el nombre truncado');
select is(
  (select count(*)::int from public.workspace_members
    where user_id = 'dddddddd-0000-0000-0000-000000000002'),
  1, 'el usuario con email largo tiene exactamente un workspace');

-- Privilegios de tabla: authenticated no conserva TRUNCATE/REFERENCES/TRIGGER.
select is(
  has_table_privilege('authenticated', t.tbl, p.priv), false,
  'authenticated no tiene ' || p.priv || ' sobre ' || t.tbl)
from (values
  ('public.workspaces'), ('public.workspace_members'), ('public.products'),
  ('public.stock_movements'), ('public.product_stock')
) as t (tbl)
cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p (priv);

-- Datos (como postgres).
insert into public.products (id, workspace_id, sku, name)
select 'cccccccc-1111-0000-0000-000000000001', workspace_id, 'C-1', 'Producto de C'
  from public.workspace_members where user_id = 'cccccccc-0000-0000-0000-000000000001';
insert into public.products (id, workspace_id, sku, name)
select 'dddddddd-1111-0000-0000-000000000001', workspace_id, 'D-1', 'Producto de D'
  from public.workspace_members where user_id = 'dddddddd-0000-0000-0000-000000000002';

-- Sesión como C.
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';

-- TRUNCATE se salta la RLS: debe estar denegado a nivel de privilegios.
select throws_ok($$truncate public.stock_movements$$,
  '42501', null, 'authenticated no puede TRUNCATE stock_movements');
select throws_ok($$truncate public.products cascade$$,
  '42501', null, 'authenticated no puede TRUNCATE products');

-- Signo según tipo: error propio antes de mirar el stock (stock actual = 0).
select throws_ok(
  $$select public.register_movement('cccccccc-1111-0000-0000-000000000001', 'in', -5)$$,
  'P0001', 'invalid_quantity_sign', 'entrada con cantidad negativa rechazada por signo');
select throws_ok(
  $$select public.register_movement('cccccccc-1111-0000-0000-000000000001', 'out', 5)$$,
  'P0001', 'invalid_quantity_sign', 'salida con cantidad positiva rechazada por signo');
select throws_ok(
  $$select public.register_movement('cccccccc-1111-0000-0000-000000000001', 'in', 0)$$,
  'P0001', 'invalid_quantity_sign', 'cantidad 0 rechazada');

-- insufficient_stock informa del stock actual en DETAIL.
select lives_ok($$
  do $b$
  declare d text;
  begin
    perform public.register_movement('cccccccc-1111-0000-0000-000000000001', 'in', 3);
    begin
      perform public.register_movement('cccccccc-1111-0000-0000-000000000001', 'out', -5);
      raise exception 'se esperaba insufficient_stock' using errcode = '55000';
    exception when sqlstate 'P0001' then
      get stacked diagnostics d = pg_exception_detail;
      if d is distinct from '3' then
        raise exception 'detail inesperado: %', d using errcode = '55000';
      end if;
    end;
  end
  $b$
$$, 'insufficient_stock lleva el stock actual en detail');

-- C no puede modificar el producto de D: 0 filas afectadas.
select lives_ok($$
  do $b$
  declare n integer;
  begin
    update public.products set name = 'hackeado'
     where id = 'dddddddd-1111-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'filas afectadas: %', n using errcode = '55000';
    end if;
  end
  $b$
$$, 'update de C sobre un producto de D afecta 0 filas');

-- C no puede subirse de rol ni añadirse a otro workspace.
select throws_ok(
  $$update public.workspace_members set role = 'owner'$$,
  '42501', null, 'C no puede modificar workspace_members');
select throws_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role)
    select workspace_id, 'cccccccc-0000-0000-0000-000000000001', 'owner'
      from public.workspace_members
     where user_id = 'dddddddd-0000-0000-0000-000000000002'$$,
  '42501', null, 'C no puede insertar membresías');

-- Checks de tabla (como postgres, saltando register_movement).
reset role;
select throws_ok(
  $$insert into public.stock_movements (workspace_id, product_id, kind, quantity)
    select workspace_id, 'cccccccc-1111-0000-0000-000000000001', 'in', -1
      from public.products where id = 'cccccccc-1111-0000-0000-000000000001'$$,
  '23514', null, 'check: entrada con signo negativo');
select throws_ok(
  $$insert into public.stock_movements (workspace_id, product_id, kind, quantity)
    select workspace_id, 'cccccccc-1111-0000-0000-000000000001', 'out', 1
      from public.products where id = 'cccccccc-1111-0000-0000-000000000001'$$,
  '23514', null, 'check: salida con signo positivo');
select throws_ok(
  $$insert into public.stock_movements (workspace_id, product_id, kind, quantity)
    select workspace_id, 'cccccccc-1111-0000-0000-000000000001', 'adjust', -1
      from public.products where id = 'cccccccc-1111-0000-0000-000000000001'$$,
  '23514', null, 'check: ajuste sin nota');
select lives_ok(
  $$insert into public.stock_movements (workspace_id, product_id, kind, quantity, note)
    select workspace_id, 'cccccccc-1111-0000-0000-000000000001', 'adjust', -1, 'recuento'
      from public.products where id = 'cccccccc-1111-0000-0000-000000000001'$$,
  'ajuste con nota permitido');

-- anon no ejecuta is_member.
set local role anon;
select throws_ok(
  $$select public.is_member('cccccccc-1111-0000-0000-000000000001')$$,
  '42501', null, 'anon no puede ejecutar is_member');

select * from finish();
rollback;
