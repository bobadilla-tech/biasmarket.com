# Marketplace / Discovery Flow

The cross-store discovery layer — see
[`docs/core/product.md` §5.10](../core/product.md#510-discovery-layer-public-cross-store).
Bias Market is not a marketplace (each store still owns its own checkout,
payment methods, and delivery rules) — this is an acquisition layer on top of
independent stores, so a buyer can find a store without already knowing it.

```
Usuario entra a biasmarket.com
        │
        ▼
   Homepage
        │
   ┌────┼──────────────────┬───────────────────┐
   ▼    ▼                   ▼                   ▼
Tiendas         Buscar productos      Entra directo a
destacadas      (/search, busca       una tienda que
(home)          en todas las          ya conoce
                 tiendas)             (/store/:slug)
   │                   │
   ▼                   ▼
Directorio de      Resultados de
tiendas (/stores,   productos (de
buscable,           cualquier tienda)
paginado)               │
   │                    ▼
   ▼               Página del producto
Selecciona una          │
tienda                  ▼
   │              "Vendido por <Tienda>"
   ▼                    │
Entra a la tienda ◄─────┘
(/store/:slug)
   │
   ▼
Explora productos de esa tienda
   │
   ▼
Sigue el flujo normal de compra
(ver docs/business/buyer-flow.md — carrito, checkout,
pago, seguimiento — todo scoped a esa tienda)
```

Notas:

- "Tiendas destacadas" no es curación manual: son tiendas públicas (no demo) con
  al menos 3 órdenes `VERIFIED` en los últimos 30 días, con al menos un producto
  publicado y disponible, y cuyo dueño no está baneado. Se ordenan por ingresos
  verificados y, en empate, por cantidad de órdenes
  (`StoresService.findFeatured`).
- Una tienda puede optar por no aparecer en directorio/búsqueda/destacadas
  (`Store.isPublic = false`, configurable en Configuración de la tienda) — no
  afecta su funcionamiento normal en `/store/:slug`, solo su visibilidad en este
  layer.
- La búsqueda de productos solo muestra productos `PUBLISHED`, igual que
  cualquier storefront individual.

## Other acquisition surfaces

Besides the directory and search, the public site has `/blog`, `/for-sellers`,
`/how-it-works`, `/how-to-buy`, `/faq` and a generated sitemap. They bring
visitors in; they are not part of the buying flow above. Stores that are thin or
near-empty are left out of the sitemap even when public.

## Related

- [buyer-flow.md](buyer-flow.md): what happens after a buyer lands on a store.
- [`../core/product.md`](../core/product.md) and
  [`../core/roadmap.md`](../core/roadmap.md): product spec and what is planned.
- [`../readme.md`](../readme.md): docs index.
