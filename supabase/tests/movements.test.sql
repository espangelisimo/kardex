-- T-05a · Idempotencia (AC-05.4), autor y historial con stock acumulado (AC-05.3).
begin;
select plan(65);

insert into auth.users (id, email) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'e@example.com'),
  ('ffffffff-0000-0000-0000-000000000002', 'f@example.com');

-- Productos (como postgres): PE1..PE3 en el workspace de E, PF1 en el de F.
insert into public.products (id, workspace_id, sku, name)
select p.id::uuid, m.workspace_id, p.sku, 'Producto ' || p.sku
  from (values
    ('eeeeeeee-1111-0000-0000-000000000001', 'E-1', 'eeeeeeee-0000-0000-0000-000000000001'),
    ('eeeeeeee-1111-0000-0000-000000000003', 'E-3', 'eeeeeeee-0000-0000-0000-000000000001'),
    ('ffffffff-1111-0000-0000-000000000001', 'F-1', 'ffffffff-0000-0000-0000-000000000002')
  ) as p (id, sku, owner)
  join public.workspace_members m on m.user_id = p.owner::uuid;

-- Resultados de las llamadas, para comparar ids entre ellas.
create temp table res (k text, id uuid);
grant all on table res to authenticated;

-- ---------------------------------------------------------------------------
-- Sesión como E
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';

-- Mismo request_id dos veces: una sola fila y el mismo id.
select lives_ok($$
  insert into res select 'a1', (public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000001', 'in', 10, null, '11111111-aaaa-4aaa-8aaa-000000000001')).id
$$, 'primer envío con request_id R1');
select lives_ok($$
  insert into res select 'a2', (public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000001', 'in', 10, null, '11111111-aaaa-4aaa-8aaa-000000000001')).id
$$, 'segundo envío con el mismo request_id no falla');
select is(
  (select count(distinct id)::int from res where k in ('a1', 'a2')), 1,
  'el segundo envío devuelve el mismo movimiento');
select is(
  (select count(*)::int from public.stock_movements
    where request_id = '11111111-aaaa-4aaa-8aaa-000000000001'),
  1, 'el envío doble crea una sola fila');
select is(
  (select stock::int from public.product_stock where id = 'eeeeeeee-1111-0000-0000-000000000001'),
  10, 'el envío doble no duplica el stock');

-- request_id distintos: dos filas.
select lives_ok($$
  select public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000001', 'in', 5, null, '11111111-aaaa-4aaa-8aaa-000000000002')
$$, 'segundo movimiento con otro request_id');
select is(
  (select count(*)::int from public.stock_movements
    where product_id = 'eeeeeeee-1111-0000-0000-000000000001'),
  2, 'request_id distintos crean dos filas');

-- request_id null: sin idempotencia, dos filas.
select lives_ok($$
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000001', 'in', 1, 'nulo', null);
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000001', 'in', 1, 'nulo', null);
$$, 'dos llamadas con request_id null');
select is(
  (select count(*)::int from public.stock_movements
    where product_id = 'eeeeeeee-1111-0000-0000-000000000001' and note = 'nulo'),
  2, 'request_id null no deduplica');

-- La firma de 4 argumentos sigue resolviendo (p_request_id tiene default).
select lives_ok($$
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000001', 'in', 1, 'cuatro')
$$, 'la llamada con 4 argumentos sigue funcionando');

-- Autor.
select is(
  (select created_by_email from public.stock_movements
    where request_id = '11111111-aaaa-4aaa-8aaa-000000000001'),
  'e@example.com', 'created_by_email es el email del usuario');

-- Tipo nulo.
select throws_ok($$
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000001', null::public.movement_kind, 1)
$$, 'P0001', 'invalid_kind', 'tipo null rechazado con invalid_kind');

-- Sin insert directo: los movimientos solo nacen en register_movement (D-02/D-03).
select throws_ok(
  $$insert into public.stock_movements (workspace_id, product_id, kind, quantity, request_id)
    select workspace_id, id, 'in', 1, gen_random_uuid() from public.products limit 1$$,
  '42501', null, 'authenticated no puede insertar movimientos directamente');

-- Historial: in 10, out 4, ajuste -3, in 5 → 10, 6, 3, 8.
-- Dentro de una transacción now() es constante: las notas "1".."4" marcan el orden real
-- y se usan abajo para separar created_at.
select lives_ok($$
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000003', 'in', 10, '1');
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000003', 'out', -4, '2');
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000003', 'adjust', -3, '3');
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000003', 'in', 5, '4');
$$, 'secuencia in/out/adjust/in');

reset role;
update public.stock_movements
   set created_at = timestamptz '2026-01-01 00:00:00+00' + note::int * interval '1 minute'
 where product_id = 'eeeeeeee-1111-0000-0000-000000000003';
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select array_agg(running_stock order by created_at, id) from public.movement_history
    where product_id = 'eeeeeeee-1111-0000-0000-000000000003'),
  array[10, 6, 3, 8]::bigint[], 'running_stock acumula en orden cronológico');
select is(
  (select array_agg(kind::text order by created_at, id) from public.movement_history
    where product_id = 'eeeeeeee-1111-0000-0000-000000000003'),
  array['in', 'out', 'adjust', 'in'], 'la vista expone el tipo de cada movimiento');
select is(
  (select running_stock from public.movement_history
    where product_id = 'eeeeeeee-1111-0000-0000-000000000003'
    order by created_at desc, id desc limit 1),
  (select stock from public.product_stock where id = 'eeeeeeee-1111-0000-0000-000000000003'),
  'el último running_stock coincide con el stock del producto');
select is(
  (select distinct created_by_email from public.movement_history
    where product_id = 'eeeeeeee-1111-0000-0000-000000000003'),
  'e@example.com', 'el historial muestra el autor');

-- insufficient_stock (stock 8) con la firma nueva.
select throws_ok($$
  select public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000003', 'out', -20, null, '11111111-aaaa-4aaa-8aaa-000000000003')
$$, 'P0001', 'insufficient_stock', 'salida mayor que el stock rechazada');
select lives_ok($$
  do $b$
  declare d text;
  begin
    begin
      perform public.register_movement(
        'eeeeeeee-1111-0000-0000-000000000003', 'out', -20, null, '11111111-aaaa-4aaa-8aaa-000000000003');
      raise exception 'se esperaba insufficient_stock' using errcode = '55000';
    exception when sqlstate 'P0001' then
      get stacked diagnostics d = pg_exception_detail;
      if d is distinct from '8' then
        raise exception 'detail inesperado: %', d using errcode = '55000';
      end if;
    end;
  end
  $b$
$$, 'insufficient_stock lleva el stock actual en detail');
select is(
  (select count(*)::int from public.stock_movements
    where request_id = '11111111-aaaa-4aaa-8aaa-000000000003'),
  0, 'un movimiento rechazado no deja la clave de idempotencia usada');


-- Notas en blanco: btrim() solo quita espacios, así que tabuladores y saltos de línea
-- deben rechazarse también (la regla no puede depender del trim de JS).
select throws_ok($$
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000003', 'adjust', -1, E'\t\n')
$$, '23514', null, 'ajuste con nota de tabulador y salto de línea rechazado');
select throws_ok($$
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000003', 'adjust', -1, E' \r\n ')
$$, '23514', null, 'ajuste con nota de espacios y retornos rechazado');
-- Espacios Unicode: la regla replica String.prototype.trim de zod y no depende de la collation.
select throws_ok($$
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000003', 'adjust', -1, U&'\FEFF')
$$, '23514', null, 'ajuste con nota solo BOM (U+FEFF) rechazado');
select throws_ok($$
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000003', 'adjust', -1, U&'\00A0')
$$, '23514', null, 'ajuste con nota solo NBSP (U+00A0) rechazado');
select throws_ok($$
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000003', 'adjust', -1, U&'\3000')
$$, '23514', null, 'ajuste con nota solo espacio ideográfico (U+3000) rechazado');
select lives_ok($$
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000003', 'adjust', 1, U&'\3000recuento\00A0\FEFF')
$$, 'ajuste con texto visible entre espacios Unicode aceptado');

-- Longitud de la nota: 500 sí, 501 no.
select lives_ok($$
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000003', 'in', 1, repeat('x', 500))
$$, 'nota de 500 caracteres aceptada');
select throws_ok($$
  select public.register_movement('eeeeeeee-1111-0000-0000-000000000003', 'in', 1, repeat('x', 501))
$$, '23514', null, 'nota de 501 caracteres rechazada');

-- Idempotencia: el mismo request_id con otra petición es un conflicto, no un éxito silencioso.
select lives_ok($$
  insert into res select 'c1', (public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000003', 'in', 2, 'c', '11111111-aaaa-4aaa-8aaa-000000000006')).id
$$, 'movimiento con request_id R6');
select lives_ok($$
  insert into res select 'c2', (public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000003', 'in', 2, 'c', '11111111-aaaa-4aaa-8aaa-000000000006')).id
$$, 'reintento idéntico no falla');
select is((select count(distinct id)::int from res where k in ('c1', 'c2')), 1,
  'el reintento idéntico devuelve el mismo movimiento');
select throws_ok($$
  select public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000003', 'in', 3, 'c', '11111111-aaaa-4aaa-8aaa-000000000006')
$$, 'P0001', 'idempotency_conflict', 'misma clave con otra cantidad: conflicto');
select throws_ok($$
  select public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000003', 'in', 2, 'otra', '11111111-aaaa-4aaa-8aaa-000000000006')
$$, 'P0001', 'idempotency_conflict', 'misma clave con otra nota: conflicto');
select throws_ok($$
  select public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000003', 'adjust', 2, 'c', '11111111-aaaa-4aaa-8aaa-000000000006')
$$, 'P0001', 'idempotency_conflict', 'misma clave con otro tipo: conflicto');
select throws_ok($$
  select public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000001', 'in', 2, 'c', '11111111-aaaa-4aaa-8aaa-000000000006')
$$, 'P0001', 'idempotency_conflict', 'misma clave con otro producto: conflicto');
-- ---------------------------------------------------------------------------
-- Sesión como F: mismo request_id en otro workspace y aislamiento
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}';

select lives_ok($$
  insert into res select 'f1', (public.register_movement(
    'ffffffff-1111-0000-0000-000000000001', 'in', 3, null, '11111111-aaaa-4aaa-8aaa-000000000001')).id
$$, 'el mismo request_id en otro workspace se acepta');
select isnt(
  (select id from res where k = 'f1'), (select id from res where k = 'a1'),
  'crea un movimiento propio, no devuelve el de otro workspace');
select is(
  (select count(*)::int from public.movement_history
    where product_id in ('eeeeeeee-1111-0000-0000-000000000001', 'eeeeeeee-1111-0000-0000-000000000003')),
  0, 'F no ve el historial de E');
select is(
  (select count(*)::int from public.movement_history), 1,
  'F solo ve su propio movimiento en el historial');
select throws_ok($$
  select public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000001', 'in', 1, null, '11111111-aaaa-4aaa-8aaa-0000000000ff')
$$, 'P0002', 'product_not_found', 'F no puede registrar sobre un producto de E');
select throws_ok($$
  select public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000001', 'in', 10, null, '11111111-aaaa-4aaa-8aaa-000000000001')
$$, 'P0002', 'product_not_found', 'F no puede recuperar un movimiento de E repitiendo su request_id');

-- ---------------------------------------------------------------------------
-- Producto archivado
-- ---------------------------------------------------------------------------
reset role;
update public.products set archived_at = now() where id = 'eeeeeeee-1111-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok($$
  select public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000001', 'in', 1, null, '11111111-aaaa-4aaa-8aaa-000000000004')
$$, 'P0001', 'product_archived', 'un producto archivado rechaza movimientos nuevos');
select lives_ok($$
  insert into res select 'a3', (public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000001', 'in', 10, null, '11111111-aaaa-4aaa-8aaa-000000000001')).id
$$, 'reintentar un movimiento ya registrado no falla aunque el producto se archivara después');
select is(
  (select id from res where k = 'a3'), (select id from res where k = 'a1'),
  'el reintento devuelve el movimiento original');

-- ---------------------------------------------------------------------------
-- Vista y privilegios
-- ---------------------------------------------------------------------------
select is(
  (select reloptions::text from pg_class where oid = 'public.movement_history'::regclass),
  '{security_invoker=true}', 'movement_history es security_invoker (S-04)');
select is(
  to_regprocedure('public.register_movement(uuid, public.movement_kind, integer, text)') is null,
  true, 'la firma antigua de register_movement ya no existe');
select is(
  has_function_privilege('authenticated',
    'public.register_movement(uuid, public.movement_kind, integer, text, uuid)', 'EXECUTE'),
  true, 'authenticated ejecuta la firma nueva');
select is(
  has_function_privilege('anon',
    'public.register_movement(uuid, public.movement_kind, integer, text, uuid)', 'EXECUTE'),
  false, 'anon no tiene EXECUTE sobre la firma nueva');

-- Productos: nombre y unidad en blanco (tabulador, salto de línea) rechazados por la base de datos.
reset role;
select throws_ok(
  $$insert into public.products (workspace_id, sku, name)
    select workspace_id, 'BLANK-1', E'\t' from public.products limit 1$$,
  '23514', null, 'nombre de producto solo con tabulador rechazado');
select throws_ok(
  $$insert into public.products (workspace_id, sku, name, unit)
    select workspace_id, 'BLANK-2', 'Ok', E'\n' from public.products limit 1$$,
  '23514', null, 'unidad de producto solo con salto de línea rechazada');
select throws_ok(
  format($f$insert into public.products (workspace_id, sku, name)
    select workspace_id, 'BLANK-%s', %s from public.products limit 1$f$, t.n, t.lit),
  '23514', null, 'nombre de producto solo con ' || t.n || ' rechazado')
from (values ('A', 'U&''\FEFF'''), ('B', 'U&''\00A0'''), ('C', 'U&''\3000''')) as t (n, lit);
select throws_ok(
  format($f$insert into public.products (workspace_id, sku, name, unit)
    select workspace_id, 'BLANK-U%s', 'Ok', %s from public.products limit 1$f$, t.n, t.lit),
  '23514', null, 'unidad de producto solo con ' || t.n || ' rechazada')
from (values ('A', 'U&''\FEFF'''), ('B', 'U&''\00A0'''), ('C', 'U&''\3000''')) as t (n, lit);

-- La función no depende de la collation: mismo resultado con "C" y con la de la base de datos.
select is(
  (select array_agg(public.has_visible_text(t.v collate "C") order by t.n)
     from (values (1, U&'\FEFF'), (2, U&'\00A0'), (3, U&'\3000'), (4, E'\t\n\r\f\v '),
                  (5, U&'\2009'), (6, ''), (7, 'a'), (8, U&'\3000a\3000'), (9, U&'\0085'), (10, U&'\200B'))
          as t (n, v)),
  array[false, false, false, false, false, false, true, true, true, true],
  'has_visible_text con collate "C" replica String.prototype.trim');
select is(
  (select array_agg(public.has_visible_text(t.v) order by t.n)
     from (values (1, U&'\FEFF'), (2, U&'\00A0'), (3, U&'\3000'), (4, E'\t\n\r\f\v '),
                  (5, U&'\2009'), (6, ''), (7, 'a'), (8, U&'\3000a\3000'), (9, U&'\0085'), (10, U&'\200B'))
          as t (n, v)),
  array[false, false, false, false, false, false, true, true, true, true],
  'has_visible_text con la collation por defecto da el mismo resultado');
select is(public.has_visible_text(null), null, 'has_visible_text(null) es null (los checks la envuelven con coalesce)');
select throws_ok(
  $$insert into public.stock_movements (workspace_id, product_id, kind, quantity)
    select workspace_id, id, 'adjust', 1 from public.products limit 1$$,
  '23514', null, 'check: ajuste con nota null sigue rechazado');

-- Barrido completo de String.prototype.trim (25 códigos): todos son "sin texto visible".
select is(
  (select array_agg(c order by c) from unnest(
     array[9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199,
           8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279]) as c
    where public.has_visible_text(chr(c))),
  null, 'ninguno de los 25 códigos de String.prototype.trim cuenta como texto visible');
select is(
  (select array_agg(public.has_visible_text(chr(c)) order by c) from unnest(array[97, 133, 8203, 6158]) as c),
  array[true, true, true, true],
  'a, U+0085, U+200B y U+180E cuentan como texto visible (igual que en zod)');
set local role anon;
select throws_ok($$
  select public.register_movement(
    'eeeeeeee-1111-0000-0000-000000000003', 'in', 1, null, '11111111-aaaa-4aaa-8aaa-000000000005')
$$, '42501', null, 'anon no puede ejecutar register_movement');
select throws_ok(
  $$select count(*) from public.movement_history$$,
  '42501', null, 'anon no puede leer movement_history');

select * from finish();
rollback;
