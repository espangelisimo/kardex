-- T-04a · Grants por columna y límites de products (AC-04.2, AC-04.3, AC-04.5).
begin;
select plan(24);

insert into auth.users (id, email) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'e@example.com'),
  ('ffffffff-0000-0000-0000-000000000002', 'f@example.com');

-- Producto de E y de F (como postgres).
insert into public.products (id, workspace_id, sku, name)
select 'eeeeeeee-1111-0000-0000-000000000001', workspace_id, 'E-1', 'Producto de E'
  from public.workspace_members where user_id = 'eeeeeeee-0000-0000-0000-000000000001';
insert into public.products (id, workspace_id, sku, name)
select 'ffffffff-1111-0000-0000-000000000001', workspace_id, 'DUP', 'Producto de F'
  from public.workspace_members where user_id = 'ffffffff-0000-0000-0000-000000000002';

-- Sesión como E.
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';

-- Columnas inmutables: update denegado por privilegios.
select throws_ok(
  $$update public.products set id = gen_random_uuid()
    where id = 'eeeeeeee-1111-0000-0000-000000000001'$$,
  '42501', null, 'no se puede actualizar id');
select throws_ok(
  $$update public.products set workspace_id = workspace_id
    where id = 'eeeeeeee-1111-0000-0000-000000000001'$$,
  '42501', null, 'no se puede actualizar workspace_id (ni a su mismo valor)');
select throws_ok(
  $$update public.products set created_at = now()
    where id = 'eeeeeeee-1111-0000-0000-000000000001'$$,
  '42501', null, 'no se puede actualizar created_at');

-- Insert que fija columnas reservadas.
select throws_ok(
  $$insert into public.products (id, workspace_id, sku, name)
    select gen_random_uuid(), workspace_id, 'N-1', 'x' from public.workspace_members
     where user_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  '42501', null, 'no se puede fijar id al insertar');
select throws_ok(
  $$insert into public.products (workspace_id, sku, name, created_at)
    select workspace_id, 'N-1', 'x', now() from public.workspace_members
     where user_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  '42501', null, 'no se puede fijar created_at al insertar');
select throws_ok(
  $$insert into public.products (workspace_id, sku, name, archived_at)
    select workspace_id, 'N-1', 'x', now() from public.workspace_members
     where user_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  '42501', null, 'no se puede fijar archived_at al insertar');

-- Camino feliz: insert con las columnas permitidas.
select lives_ok(
  $$insert into public.products (workspace_id, sku, name, unit, min_stock)
    select workspace_id, 'OK.1_A-B'::text, 'Nuevo', 'kg', 3 from public.workspace_members
     where user_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  'insert con las columnas permitidas') ;

-- Update de columnas editables.
select lives_ok(
  $$update public.products
       set sku = 'E-2', name = 'Renombrado', unit = 'caja', min_stock = 7
     where id = 'eeeeeeee-1111-0000-0000-000000000001'$$,
  'update de columnas editables');
select is(
  (select sku || '|' || name || '|' || unit || '|' || min_stock
     from public.products where id = 'eeeeeeee-1111-0000-0000-000000000001'),
  'E-2|Renombrado|caja|7', 'las columnas editables se han guardado');

-- Archivar y desarchivar (AC-04.3).
select lives_ok(
  $$update public.products set archived_at = now()
    where id = 'eeeeeeee-1111-0000-0000-000000000001'$$, 'archivar');
select isnt(
  (select archived_at from public.products where id = 'eeeeeeee-1111-0000-0000-000000000001'),
  null, 'el producto queda archivado');

-- Un archivado sigue rechazando movimientos.
select throws_ok(
  $$select public.register_movement('eeeeeeee-1111-0000-0000-000000000001', 'in', 1)$$,
  'P0001', 'product_archived', 'register_movement rechaza un producto archivado');

select lives_ok(
  $$update public.products set archived_at = null
    where id = 'eeeeeeee-1111-0000-0000-000000000001'$$, 'desarchivar');
select is(
  (select archived_at from public.products where id = 'eeeeeeee-1111-0000-0000-000000000001'),
  null, 'el producto vuelve a estar activo');

-- Formato del SKU.
select throws_ok(
  $$update public.products set sku = 'abc' where id = 'eeeeeeee-1111-0000-0000-000000000001'$$,
  '23514', null, 'SKU con minúsculas rechazado');
select throws_ok(
  $$update public.products set sku = 'A B' where id = 'eeeeeeee-1111-0000-0000-000000000001'$$,
  '23514', null, 'SKU con espacio rechazado');
select throws_ok(
  $$update public.products set sku = 'AÑO' where id = 'eeeeeeee-1111-0000-0000-000000000001'$$,
  '23514', null, 'SKU con Ñ rechazado');
select throws_ok(
  $$update public.products set sku = 'A' || chr(10)
    where id = 'eeeeeeee-1111-0000-0000-000000000001'$$,
  '23514', null, 'SKU con salto de línea final rechazado');
select throws_ok(
  $$update public.products set sku = repeat('A', 33)
    where id = 'eeeeeeee-1111-0000-0000-000000000001'$$,
  '23514', null, 'SKU de 33 caracteres rechazado');
select lives_ok(
  $$update public.products set sku = repeat('A', 32)
    where id = 'eeeeeeee-1111-0000-0000-000000000001'$$,
  'SKU de 32 caracteres aceptado');

-- Longitudes de name y unit.
select throws_ok(
  $$update public.products set name = repeat('n', 121)
    where id = 'eeeeeeee-1111-0000-0000-000000000001'$$,
  '23514', null, 'name de 121 caracteres rechazado');
select throws_ok(
  $$update public.products set unit = repeat('u', 21)
    where id = 'eeeeeeee-1111-0000-0000-000000000001'$$,
  '23514', null, 'unit de 21 caracteres rechazado');

-- SKU duplicado: mismo workspace → 23505.
select throws_ok(
  $$insert into public.products (workspace_id, sku, name)
    select workspace_id, 'OK.1_A-B', 'Duplicado' from public.workspace_members
     where user_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  '23505', null, 'SKU duplicado en el mismo workspace → 23505') ;

-- Otro workspace: el mismo SKU se acepta (F ya tiene DUP; E crea DUP).
select lives_ok(
  $$insert into public.products (workspace_id, sku, name)
    select workspace_id, 'DUP', 'Mismo SKU, otro workspace' from public.workspace_members
     where user_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  'el mismo SKU en otro workspace se acepta');

select * from finish();
rollback;
