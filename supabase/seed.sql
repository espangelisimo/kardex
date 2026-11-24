-- T-06 · Datos de ejemplo (AC-06.2): una ferretería pequeña para el usuario demo.
--
-- No crea usuarios ni lleva contraseñas (S-01): el usuario demo@kardex.test se
-- registra antes (en /login, o desde Authentication en el dashboard remoto) y
-- el trigger de alta le crea su workspace. Este script solo carga datos en él.
-- Es idempotente: sin usuario, o con un workspace que ya tiene productos, no hace nada.
--
-- Se ejecuta como postgres, así que se salta la RLS y register_movement(). Por eso
-- al final comprueba por su cuenta que ningún stock acumulado queda negativo (D-03).
do $$
declare
  v_email constant text := 'demo@kardex.test';
  v_user_id uuid;
  v_workspace_id uuid;
begin
  select u.id into v_user_id from auth.users u where u.email = v_email;
  if v_user_id is null then
    raise notice 'seed: no existe el usuario %; regístralo primero. No se carga nada.', v_email;
    return;
  end if;

  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = v_user_id
  order by (wm.role = 'owner') desc, wm.workspace_id
  limit 1;
  if v_workspace_id is null then
    raise notice 'seed: el usuario % no tiene workspace. No se carga nada.', v_email;
    return;
  end if;

  if exists (select 1 from public.products p where p.workspace_id = v_workspace_id) then
    raise notice 'seed: el workspace ya tiene productos. No se carga nada.';
    return;
  end if;

  insert into public.products (workspace_id, sku, name, unit, min_stock) values
    (v_workspace_id, 'MART-01',   'Martillo de carpintero',        'ud',   3),
    (v_workspace_id, 'TOR-M6',    'Tornillos M6 (caja de 100)',    'caja', 10),
    (v_workspace_id, 'CABLE-2.5', 'Cable eléctrico 2,5 mm',        'm',    100),
    (v_workspace_id, 'CEM-25',    'Cemento gris',                  'kg',   150),
    (v_workspace_id, 'PINT-BL',   'Pintura plástica blanca 15 L',  'ud',   4),
    (v_workspace_id, 'TAL-18V',   'Taladro inalámbrico 18 V',      'ud',   2),
    (v_workspace_id, 'GUANT-L',   'Guantes de trabajo talla L',    'caja', 3),
    (v_workspace_id, 'LIJA-80',   'Lija grano 80',                 'ud',   20);

  -- Un producto archivado con historial (la baja se explica con un ajuste).
  update public.products
  set archived_at = now() - interval '7 days'
  where workspace_id = v_workspace_id and sku = 'LIJA-80';

  -- sku, tipo, cantidad, nota, días atrás. Dentro de cada producto va en orden
  -- cronológico y nunca baja de cero. Las horas se reparten para no empatar.
  insert into public.stock_movements
    (workspace_id, product_id, kind, quantity, note, created_by, created_by_email, request_id, created_at)
  select
    v_workspace_id,
    p.id,
    m.kind::public.movement_kind,
    m.quantity,
    m.note,
    v_user_id,
    v_email,
    null,
    now() - m.days_ago * interval '1 day' - (row_number() over (order by m.days_ago desc, m.sku) % 10) * interval '1 hour'
  from (values
    ('MART-01',   'in',   10,  null, 27),
    ('MART-01',   'out',  -2,  null, 20),
    ('MART-01',   'out',  -3,  null, 12),
    ('MART-01',   'in',    5,  null,  8),
    ('MART-01',   'out',  -4,  null,  3),
    ('TOR-M6',    'in',   40,  null, 26),
    ('TOR-M6',    'out', -15,  null, 18),
    ('TOR-M6',    'out', -12,  null, 10),
    ('TOR-M6',    'adjust', -5, 'Recuento: faltan 5 cajas', 6),
    ('TOR-M6',    'out',  -6,  null,  2),
    ('CABLE-2.5', 'in',  500,  null, 25),
    ('CABLE-2.5', 'out', -150, null, 19),
    ('CABLE-2.5', 'out', -200, null, 11),
    ('CABLE-2.5', 'out', -120, null,  5),
    ('CABLE-2.5', 'adjust', 20, 'Retal sobrante encontrado en el recuento', 1),
    ('CEM-25',    'in',  600,  null, 24),
    ('CEM-25',    'out', -200, null, 15),
    ('CEM-25',    'in',  300,  null,  9),
    ('CEM-25',    'out', -250, null,  4),
    ('PINT-BL',   'in',   12,  null, 23),
    ('PINT-BL',   'out',  -5,  null, 14),
    ('PINT-BL',   'out',  -3,  null,  7),
    ('PINT-BL',   'in',    6,  null,  2),
    ('TAL-18V',   'in',    6,  null, 22),
    ('TAL-18V',   'out',  -2,  null, 13),
    ('TAL-18V',   'adjust', -1, 'Unidad defectuosa devuelta al proveedor', 5),
    ('GUANT-L',   'in',   20,  null, 21),
    ('GUANT-L',   'out',  -8,  null, 16),
    ('GUANT-L',   'out',  -6,  null,  9),
    ('GUANT-L',   'out',  -4,  null,  3),
    ('LIJA-80',   'in',  100,  null, 28),
    ('LIJA-80',   'out', -60,  null, 17),
    ('LIJA-80',   'adjust', -40, 'Producto descatalogado: se retira el stock restante', 8)
  ) as m (sku, kind, quantity, note, days_ago)
  join public.products p on p.workspace_id = v_workspace_id and p.sku = m.sku;

  -- Como el seed se salta register_movement(), se vigila él mismo (D-03):
  -- si algún acumulado cronológico es negativo, falla y deshace todo.
  if exists (
    select 1 from public.movement_history h
    where h.workspace_id = v_workspace_id and h.running_stock < 0
  ) then
    raise exception 'seed: un producto tiene stock acumulado negativo';
  end if;

  raise notice 'seed: datos de ejemplo cargados para %.', v_email;
end;
$$;
