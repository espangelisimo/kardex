import Link from "next/link";
import { ProductForm } from "../product-form";

export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/app/productos" className="text-sm underline">
        ← Productos
      </Link>
      <h1 className="text-xl font-semibold">Nuevo producto</h1>
      <ProductForm />
    </div>
  );
}
