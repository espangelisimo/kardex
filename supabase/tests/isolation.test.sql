begin;
select plan(18);

-- Dos usuarios; el trigger de alta crea su workspace.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com');

-- AC-01.4
select is(
  (select count(*)::int from public.workspace_members
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1, 'A tiene exactamente un workspace');
select is(
  (select role::text from public.workspace_members
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'owner', 'A es owner');
select is(
  (select count(*)::int from public.workspace_members
    where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  1, 'B tiene exactamente un workspace');

-- Datos de ambos (como postgres, sin RLS).
create temp table ctx as
select
  (select workspace_id from public.workspace_members
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') as ws_a,
  (select workspace_id from public.workspace_members
    where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') as ws_b;
grant select on ctx to authenticated;

insert into public.products (id, workspace_id, sku, name)
select 'bbbbbbbb-1111-0000-0000-000000000001', ws_b, 'B-1', 'Producto de B' from ctx;
insert into public.products (id, workspace_id, sku, name)
select 'aaaaaaaa-1111-0000-0000-000000000001', ws_a, 'A-1', 'Producto de A' from ctx;
insert into public.stock_movements (workspace_id, product_id, kind, quantity)
select ws_b, 'bbbbbbbb-1111-0000-0000-000000000001', 'in', 5 from ctx;

-- Sesión como A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select is((select count(*)::int from public.products), 1, 'A solo ve su producto');
select is((select count(*)::int from public.product_stock
            where id = 'bbbbbbbb-1111-0000-0000-000000000001'),
  0, 'A no ve el producto de B en product_stock');
select is((select count(*)::int from public.stock_movements), 0, 'A no ve movimientos de B');
select is((select count(*)::int from public.workspaces), 1, 'A solo ve su workspace');

select throws_ok(
  $$insert into public.products (workspace_id, sku, name)
    select ws_b, 'X', 'Intruso' from ctx$$,
  '42501', null, 'A no puede insertar productos en el workspace de B');

select throws_ok(
  $$select public.register_movement('bbbbbbbb-1111-0000-0000-000000000001', 'in', 1)$$,
  'P0002', 'product_not_found', 'A no puede registrar movimientos sobre un producto de B');

select throws_ok(
  $$insert into public.stock_movements (workspace_id, product_id, kind, quantity)
    select ws_b, 'bbbbbbbb-1111-0000-0000-000000000001', 'in', 1 from ctx$$,
  '42501', null, 'insert directo en stock_movements denegado');

select throws_ok(
  $$update public.products set workspace_id = (select ws_b from ctx)
    where id = 'aaaaaaaa-1111-0000-0000-000000000001'$$,
  '42501', null, 'A no puede mover un producto suyo al workspace de B');

-- Movimientos legítimos de A.
select lives_ok(
  $$select public.register_movement('aaaaaaaa-1111-0000-0000-000000000001', 'in', 10)$$,
  'A registra una entrada');

-- AC-01.3
select throws_ok(
  $$select public.register_movement('aaaaaaaa-1111-0000-0000-000000000001', 'out', -11)$$,
  'P0001', 'insufficient_stock', 'salida mayor que el stock rechazada');
select lives_ok(
  $$select public.register_movement('aaaaaaaa-1111-0000-0000-000000000001', 'out', -10)$$,
  'salida exacta hasta 0 permitida');
select is((select stock from public.product_stock
            where id = 'aaaaaaaa-1111-0000-0000-000000000001'),
  0::bigint, 'stock calculado = 0');

-- Inmutabilidad (D-02).
select throws_ok($$update public.stock_movements set quantity = 99$$,
  '42501', null, 'update sobre stock_movements denegado');
select throws_ok($$delete from public.stock_movements$$,
  '42501', null, 'delete sobre stock_movements denegado');

-- anon no ejecuta register_movement.
reset role;
set local role anon;
select throws_ok(
  $$select public.register_movement('aaaaaaaa-1111-0000-0000-000000000001', 'in', 1)$$,
  '42501', null, 'anon no puede ejecutar register_movement');

select * from finish();
rollback;
