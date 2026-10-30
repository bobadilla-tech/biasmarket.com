# Tarjeta de producto en móvil (vista Cuadrícula)

Mapa de código para los issues de la tarjeta de la vista Cuadrícula en `/dashboard/[slug]/products`, a ~390 px.

- Índice: #549
- Épicas: #550 (tarjeta legible), #551 (textos y stock)

## Dónde vive cada cosa

| Qué | Archivo | Líneas | Issue |
| --- | --- | --- | --- |
| Contenedor de la cuadrícula (`md:grid-cols-2 xl:grid-cols-3`, 1 columna en móvil) | `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/products/products-page-client.tsx` | 255-285 | #556 |
| Tarjeta (componente completo) | `apps/web/features/products/components/product-tile.tsx` | todo | #552-#557 |
| Chips de categoría, estado y disponibilidad en el encabezado | `product-tile.tsx` | 79-86 | #554 |
| Estado Publicado (chip) | `product-tile.tsx` | 43-55 | #554 |
| Disponibilidad (usa `getProductAvailabilityState`) | `product-tile.tsx` | 56-74 | #554, #561 |
| Botón Publicar (borradores) | `product-tile.tsx` | 88-99 | #554 |
| Botones Editar y Eliminar | `product-tile.tsx` | 100-121 | #553 |
| Imagen de 80 px en caja tintada | `product-tile.tsx` | 124-146 | #555 |
| Descripción sin recorte | `product-tile.tsx` | 153-155 | #552 |
| Precio y stock | `product-tile.tsx` | 158-165 | #557 |
| Handler de eliminar (sin confirmación) | `products-page-client.tsx` | 150-152 | #553 (fuera de alcance) |
| Etiqueta de stock (`{count} unidades`) | `packages/i18n/es/dashboard.json` | 32 | #559 |
| Uso de la etiqueta en la cuadrícula y en la lista | `products-page-client.tsx` | 263, 329 | #559 |
| Texto "Agotado" (`products.details.soldOut`) | `packages/i18n/es/dashboard.json` | 87 | #561 |
| Descripción completa en detalle | `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/products/[productId]/product-detail-page-client.tsx` | 316 | #552, #560 |

## Preguntas del reporte, respondidas por el código

1. **¿Dónde vive la descripción completa?** En la página de detalle (`[productId]`, línea 316).
2. **¿Eliminar pide confirmación?** No. `handleDelete` llama a `deleteProduct.mutate` directo.
3. **¿Columnas en tablet y escritorio?** Hoy 2 en `md` y 3 en `xl`. Sigue abierta.
4. **¿Stock 0 con etiqueta propia?** Ya existe "Agotado" para stock ≤ 0.

## Fuera de alcance

- Vista Lista (`ProductRow`).
- Encabezado, campana de notificaciones y formulario de edición.
- Confirmación al eliminar (cambio de comportamiento aparte).
