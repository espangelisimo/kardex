import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ArchiveForm, ProductForm } from "../product-form";

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
      {/* T-05: aquí irán los movimientos y el historial del producto. */}
    </div>
  );
}
