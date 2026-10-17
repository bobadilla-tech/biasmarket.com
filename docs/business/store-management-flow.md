# Store Management Flow

Product/category/settings management from the seller dashboard. See
[`docs/core/product.md` §5.2](../core/product.md#52-product-management--crud-seller-panel)
for the full CRUD rules this follows (draft/publish gating, soft delete, variant
stock).

Not in the schema: a brand ("Marca") field and a SKU field on variants. The
store does have a banner image (`Store.bannerUrl`), logo, and Instagram and
TikTok links (`instagramUrl`, `tiktokUrl`), all edited in Configuración.

```
Dashboard (/dashboard/:slug)
        │
   Menú lateral (cada entrada es /dashboard/:slug/<entrada>):
   Resumen, Pedidos, Productos, Colecciones, Secciones, Envíos, Pagos
   Clientes, Reposición, Analíticas, Notificaciones
   Configuración, Preferencias
        │
        ▼
   Productos
   │
   ▼
Crear producto
   │
   ▼
Información básica
   • Nombre
   • Descripción
   • Precio base + moneda
   • Imágenes (hasta 5)
   │
   ▼
Crear variantes (opcional)
   • Nombre (versión, member, talla, etc.)
   • Stock (o ilimitado — null)
   • Precio override (opcional)
   • Imagen override (opcional)
   • Atributos libres (JSON)
   │
   ▼
Asignar categoría(s) / colección(es) (opcional)
   │
   ▼
Guardar como DRAFT o publicar directo
   │
   ▼
Si PUBLISHED → visible en /store/:slug


Editar productos
────────────────
Dashboard → Productos → Editar
   │
   ▼
Actualizar: precio, stock, fotos, descripción, variantes,
categoría/colección, mover entre DRAFT ↔ PUBLISHED,
marcar "sold out" manualmente
   │
   ▼
Guardar → cambios visibles inmediatamente
   │
   ▼
Eliminar: soft delete — un producto referenciado por
cualquier orden existente nunca se borra realmente
(sigue resolviéndose desde el historial de esa orden,
pero desaparece del storefront y de la lista por defecto)


Categorías / Colecciones
────────────────────────
Categorías: no tienen página propia; se crean o reutilizan por nombre
desde el formulario de producto y se asignan ahí
Dashboard → Colecciones → Crear colección → asignar productos
                                           → usable en secciones
                                             del storefront


Configuración de la tienda
───────────────────────────
Dashboard → Configuración → Editar
   • Nombre de la tienda
   • Logo, banner y enlaces de Instagram / TikTok
   • Idioma de la tienda (ES/EN)
   • Moneda por defecto
   • WhatsApp (número de contacto — el checkout arma el mensaje
     wa.me para coordinar el pago; si no hay número, el comprador
     solo recibe las instrucciones de pago)
   • Instrucciones de pago
   • Métodos de pago habilitados + % de depósito
   • Métodos de entrega (recojo / courier) y puntos de recojo
   • Ventana de expiración de orden sin pagar (horas)
   • Umbral y alertas de stock bajo
   • Visibilidad en directorio/búsqueda global (Store.isPublic)
   • Mensajes de WhatsApp (plantillas configurables)
   • Couriers de la tienda
   │
   ▼
Guardar
```

## Other dashboard pages

- **Resumen** (`/dashboard/:slug`): overview stats for the store.
- **Pedidos** (`/orders`, `/orders/new`): the order list and detail, and the
  assisted-order form. Payment review and fulfillment are in
  [seller-flow.md](seller-flow.md).
- **Pagos** (`/payments`): orders that need payment attention, plus revenue by
  payment method.
- **Envíos** (`/shipping`): orders being fulfilled. Tracking details and the
  packed photo that the buyer sees on the order page are recorded in the order
  detail (shipping section). The courier list and the WhatsApp message templates
  are configured in Configuración, not here.
- **Secciones** (`/sections`): the storefront home blocks. A section is a
  collection, a banner or a text block, and sections can be reordered.
- **Clientes** (`/customers`): everyone who has bought from the store, with
  order count, lifetime spend and order history.
- **Reposición** (`/restock`): buyers who asked to be told when a sold-out item
  returns, sortable by most recent or most requested, with a WhatsApp contact
  action.
- **Analíticas** (`/analytics`): revenue, orders, and new versus returning
  customers over a selectable range.
- **Notificaciones** (`/notifications`): in-panel notifications with read and
  archive actions.
- **Preferencias** (`/preferences`): suggestions based on the store's activity,
  which the seller can dismiss.

## Account, onboarding and coupons

- **Login and signup** (`/login`, `/onboarding`): email and password, with
  Google sign-in when the server has Google credentials configured. Email
  verification is required (`/verify-email`).
- **Create store** (`/onboarding/create-store`): first-time store creation.
- **Account** (`/account`, linked from the sidebar): change password, the
  seller's stores, and the coupon redeem form. A valid coupon code extends the
  seller's premium period by the coupon's duration. How coupons and premium work
  is summarized in [`../core/product.md`](../core/product.md).

## Related

- [seller-flow.md](seller-flow.md): order and payment handling.
- [buyer-flow.md](buyer-flow.md): what the buyer sees of these settings.
- [`../core/product.md`](../core/product.md) and
  [`../core/roadmap.md`](../core/roadmap.md): product spec and what is planned.
- [`../readme.md`](../readme.md): docs index.
