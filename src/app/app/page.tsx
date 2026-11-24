import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatSignedQuantity, MOVEMENT_KIND_LABEL } from "@/domain/format";
import { isLowStock } from "@/domain/stock";

const numberFormat = new Intl.NumberFormat("es-ES");
const linkClass =
  "rounded border border-black/30 px-3 py-2 text-sm font-medium hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/40 dark:hover:bg-white/10";
const cardClass = "flex flex-col gap-1 rounded border border-black/20 px-4 py-3 dark:border-white/30";
const emptyClass = "rounded border border-dashed border-black/30 p-6 text-center dark:border-white/40";

export default async function PanelPage() {
  const supabase = await createClient();
  // La RLS (S-03) y security_invoker (S-04) limitan todo al workspace del usuario.
  const [productsResult, movementsResult] = await Promise.all([
    supabase.from("product_stock").select("id, min_stock, stock").is("archived_at", null),
    supabase
      .from("movement_history")
      .select("id, created_at, kind, quantity, product_id, created_by_email")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(10),
  ]);
  if (productsResult.error) console.error("Panel: productos falló:", productsResult.error.code);
  if (movementsResult.error) console.error("Panel: movimientos falló:", movementsResult.error.code);

  // Una sola consulta extra para los nombres (sin N+1). Incluye archivados: pueden tener historial.
  const movements = movementsResult.data;
  const productIds = movements ? [...new Set(movements.map((m) => m.product_id))] : [];
  const namesResult =
    productIds.length > 0
      ? await supabase.from("product_stock").select("id, sku, name, unit").in("id", productIds)
      : null;
  if (namesResult?.error) console.error("Panel: nombres falló:", namesResult.error.code);
  const productById = new Map((namesResult?.data ?? []).map((p) => [p.id, p]));

  const products = productsResult.data;
  const lowCount = products ? products.filter((p) => isLowStock(p.stock ?? 0, p.min_stock)).length : 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Panel</h1>

      {products === null ? (
        <p role="alert" className="text-red-700 dark:text-red-400">
          No se han podido cargar los productos. Recarga la página o inténtalo más tarde.
        </p>
      ) : products.length === 0 ? (
        <div className={`${emptyClass} flex flex-col items-center gap-3`}>
          <p>Aún no tienes productos</p>
          <Link href="/app/productos/nuevo" className={linkClass}>
            Crear el primer producto
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link href="/app/productos" className={cardClass}>
            <span className="text-sm opacity-70">Productos activos</span>
            <span className="text-2xl font-semibold">{numberFormat.format(products.length)}</span>
          </Link>
          <Link href="/app/productos" className={cardClass}>
            <span className="text-sm opacity-70">Con stock bajo</span>
            <span className="text-2xl font-semibold">{numberFormat.format(lowCount)}</span>
          </Link>
        </div>
      )}

      <section aria-labelledby="ultimos-titulo" className="flex flex-col gap-3">
        <h2 id="ultimos-titulo" className="text-lg font-semibold">
          Últimos movimientos
        </h2>
        {movements === null ? (
          <p role="alert" className="text-red-700 dark:text-red-400">
            No se han podido cargar los movimientos. Recarga la página o inténtalo más tarde.
          </p>
        ) : movements.length === 0 ? (
          <p className={emptyClass}>Aún no hay movimientos</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {movements.map((m) => {
              const product = productById.get(m.product_id);
              return (
                <li key={m.id} className="rounded border border-black/20 px-3 py-2 dark:border-white/30">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">
                      {MOVEMENT_KIND_LABEL[m.kind]} {formatSignedQuantity(m.quantity)} {product?.unit ?? ""}
                    </span>
                    <time dateTime={m.created_at} className="text-sm opacity-70">
                      {formatDateTime(m.created_at)}
                    </time>
                  </div>
                  <div className="break-words text-sm">
                    <Link
                      href={`/app/productos/${m.product_id}`}
                      className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      {product?.name ?? "Producto desconocido"}
                    </Link>
                    {product && <span className="opacity-70"> · {product.sku}</span>}
                  </div>
                  <div className="break-words text-sm opacity-70">{m.created_by_email ?? "Autor desconocido"}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
