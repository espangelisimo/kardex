import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const numberFormat = new Intl.NumberFormat("es-ES");
const linkClass =
  "rounded border border-black/30 px-3 py-2 text-sm font-medium hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/40 dark:hover:bg-white/10";

export default async function ProductsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ archivados?: string | string[] }> }>) {
  const { archivados } = await searchParams;
  const showArchived = archivados === "1";

  const supabase = await createClient();
  // La RLS (S-03) limita el resultado a los workspaces del usuario.
  const base = supabase.from("product_stock").select("id, sku, name, unit, min_stock, stock").order("name");
  const { data: products, error } = await (showArchived
    ? base.not("archived_at", "is", null)
    : base.is("archived_at", null));

  if (error) {
    console.error("Listado de productos: consulta falló:", error.code);
    return (
      <p role="alert" className="text-red-700 dark:text-red-400">
        No se han podido cargar los productos. Recarga la página o inténtalo más tarde.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{showArchived ? "Productos archivados" : "Productos"}</h1>
        <div className="flex flex-wrap gap-2">
          <Link href={showArchived ? "/app/productos" : "/app/productos?archivados=1"} className={linkClass}>
            {showArchived ? "Ver activos" : "Ver archivados"}
          </Link>
          <Link href="/app/productos/nuevo" className={linkClass}>
            Nuevo producto
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        showArchived ? (
          <p className="rounded border border-dashed border-black/30 p-6 text-center dark:border-white/40">
            No hay productos archivados.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded border border-dashed border-black/30 p-6 text-center dark:border-white/40">
            <p>Aún no tienes productos</p>
            <Link href="/app/productos/nuevo" className={linkClass}>
              Crear el primer producto
            </Link>
          </div>
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {products.map((p) => {
            const stock = p.stock ?? 0;
            const low = stock <= p.min_stock;
            return (
              <li key={p.id}>
                <Link
                  href={`/app/productos/${p.id}`}
                  className="flex items-center justify-between gap-3 rounded border border-black/20 px-3 py-2 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/30 dark:hover:bg-white/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate text-sm opacity-70">{p.sku}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-right sm:flex-row sm:items-center sm:gap-3">
                    {low && (
                      <span className="rounded border border-red-600 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                        Stock bajo
                      </span>
                    )}
                    <span>
                      {numberFormat.format(stock)} {p.unit}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
