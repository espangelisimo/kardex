import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formatSignedQuantity, MOVEMENT_KIND_LABEL } from "@/domain/format";
import { ArchiveForm, ProductForm } from "../product-form";
import { MovementForm } from "./movement-form";

const numberFormat = new Intl.NumberFormat("es-ES");
const dateFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" });

export default async function ProductPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  // La RLS (S-03) decide qué es visible: un producto de otro workspace llega como "no existe".
  const { data: product, error } = await supabase
    .from("products")
    .select("id, sku, name, unit, min_stock, archived_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("Ficha de producto: consulta falló:", error.code);
    return (
      <p role="alert" className="text-red-700 dark:text-red-400">
        No se ha podido cargar el producto. Inténtalo de nuevo.
      </p>
    );
  }
  if (!product) notFound();

  const archived = product.archived_at !== null;

  // Stock e historial: la RLS (S-03) y security_invoker (S-04) limitan lo visible.
  const [stockResult, historyResult] = await Promise.all([
    supabase.from("product_stock").select("stock").eq("id", id).maybeSingle(),
    // created_at desc, id desc: mismo orden que el acumulado de la vista.
    supabase
      .from("movement_history")
      .select("id, created_at, kind, quantity, running_stock, created_by_email, note")
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);
  if (stockResult.error) console.error("Ficha de producto: stock falló:", stockResult.error.code);
  if (historyResult.error) console.error("Ficha de producto: historial falló:", historyResult.error.code);
  const stock = stockResult.data?.stock ?? 0;
  const history = historyResult.data;
  // Cada pintado de la ficha genera una clave nueva (AC-05.4).
  const requestId = crypto.randomUUID();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/productos" className="text-sm underline">
        ← Productos
      </Link>
      <h1 className="min-w-0 truncate text-xl font-semibold">{product.name}</h1>
      {archived && (
        <p className="max-w-md rounded border border-amber-600 px-3 py-2 text-sm">
          Producto archivado: no admite movimientos. Puedes editarlo o desarchivarlo.
        </p>
      )}
      <ProductForm product={product} />
      <section aria-label="Archivado" className="border-t border-black/10 pt-4 dark:border-white/20">
        <ArchiveForm id={product.id} archived={archived} />
      </section>
      <section aria-labelledby="movimientos-titulo" className="flex flex-col gap-4 border-t border-black/10 pt-4 dark:border-white/20">
        <h2 id="movimientos-titulo" className="text-lg font-semibold">
          Movimientos
        </h2>
        {stockResult.error ? (
          <p role="alert" className="text-red-700 dark:text-red-400">
            No se ha podido cargar el stock.
          </p>
        ) : (
          <p>
            Stock actual:{" "}
            <strong>
              {numberFormat.format(stock)} {product.unit}
            </strong>
          </p>
        )}
        {archived ? (
          <p className="max-w-md text-sm">Para registrar movimientos, desarchiva primero el producto.</p>
        ) : (
          <MovementForm productId={product.id} requestId={requestId} />
        )}

        <h3 className="font-medium">Historial</h3>
        {history === null ? (
          <p role="alert" className="text-red-700 dark:text-red-400">
            No se ha podido cargar el historial. Recarga la página o inténtalo más tarde.
          </p>
        ) : history.length === 0 ? (
          <p className="rounded border border-dashed border-black/30 p-6 text-center dark:border-white/40">
            Aún no hay movimientos
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((m) => (
              <li key={m.id} className="rounded border border-black/20 px-3 py-2 dark:border-white/30">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">
                    {MOVEMENT_KIND_LABEL[m.kind]} {formatSignedQuantity(m.quantity)} {product.unit}
                  </span>
                  <time dateTime={m.created_at} className="text-sm opacity-70">
                    {dateFormat.format(new Date(m.created_at))}
                  </time>
                </div>
                <div className="text-sm">Stock acumulado: {numberFormat.format(m.running_stock ?? 0)}</div>
                <div className="break-words text-sm opacity-70">{m.created_by_email ?? "Autor desconocido"}</div>
                {m.note && <div className="break-words text-sm">{m.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
