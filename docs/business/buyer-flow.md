# Buyer Flow

Reflects the payment flow implemented in the app. At checkout the buyer sees the
store's payment instructions, attaches a proof image for manual methods, and
gets a WhatsApp handoff to coordinate with the seller. The seller reviews the
proof or records the payment in the panel. See
[`docs/core/security-payments.md` §9](../core/security-payments.md#9-payment-flow-design-manual)
and
[`docs/core/product.md` §5.6–5.7](../core/product.md#56-checkout--order-creation-flow)
for the technical/product-level source of truth this diagram follows.

A buyer can submit a proof image from three places: at checkout (for the manual
methods `YAPE`, `PLIN` and `TRANSFER`, unless the store left the method's
details empty), on the private order page `/store/:slug/pedido/:token`, and from
`/store/:slug/account/orders/:id`. Submitting a proof creates a pending-review
payment; it does not change the order's payment status by itself. Limits and
guard rules live in
[`security-payments.md` §9.3.1](../core/security-payments.md#931-buyer-proof-upload-by-private-link),
not here.

```
Entra a Bias Market
        │
        ▼
   Homepage (/) — o entra directo a /store/:slug
        │
        ├── Explora tiendas destacadas / directorio (/stores)
        ├── Busca productos entre todas las tiendas (/search)
        └── Entra directo a una tienda
        │
        ▼
   Página de la tienda (/store/:slug)
        │
        ▼
   Selecciona un producto
        │
        ▼
   Página del producto (/store/:slug/product/:productId)
        │
        ▼
   Selecciona variante (versión, member, etc.) si aplica
        │
        ▼
   Agregar al carrito
        │
        ▼
   Checkout
        │
        ▼
   Escoge método de entrega
        • Recojo en punto (pickup point)
        • Envío / courier
        │
        ▼
   Sistema calcula el pago requerido
   (depósito % o pago completo, según método de entrega
   y configuración de la tienda)
        │
        ▼
   Completa datos de contacto
        • Nombre
        • Teléfono (+ email opcional)
        │
        ▼
   Crear cuenta de comprador o iniciar sesión
   (teléfono + contraseña; email opcional, con verificación)
        │
        ▼
   Orden creada → PENDING_PAYMENT
        • Hold de stock (soft-hold, no descuenta stock real)
        • No cuenta como venta confirmada
        • Expira sola si el vendedor no registra el pago
          (ventana configurable, default 48h)
        │
        ▼
   Handoff a WhatsApp — checkout abre un mensaje wa.me
   prellenado (id de orden, items, total, método de entrega
   y pago) al número de la tienda; el pago se coordina con
   el vendedor fuera de la app (si la tienda no tiene WhatsApp
   configurado, el comprador solo recibe las instrucciones de pago)
        │
        ▼
   El comprador puede subir (o volver a subir) su comprobante:
   en el checkout, en /store/:slug/pedido/:token o en
   /store/:slug/account/orders/:id → queda PENDING_REVIEW
        │
        ▼
   El vendedor revisa el comprobante (aprobar / rechazar / anular)
   o registra lo recibido en su panel
   (monto, método, nota, imagen opcional) → aprobar / rechazar
        │
   ┌────┴────┐
   ▼         ▼
Aprueba    Rechaza
   │         │
   ▼         ▼
VERIFIED   REJECTED
(venta      (hold liberado,
confirmada,  stock disponible
stock        de nuevo)
descontado)
   │
   ▼
Sigue el ciclo de cumplimiento (si aplica al tipo de tienda):
ORDERING → IN_TRANSIT → READY → COMPLETED
   │
   ▼
"Mis pedidos" — el comprador ve el estado de cada orden
en todo momento, desde PENDING_PAYMENT hasta COMPLETED
```

Si la orden expira sin pago registrado: `PENDING_PAYMENT` → `CANCELLED`
automáticamente, sin acción del vendedor, hold liberado.

## Accounts and order access

There are two buyer identities, both documented in
[`security-payments.md` §7.5](../core/security-payments.md#75-seller-and-buyer-identity):

- **Global account** (`BuyerAccount`, unique phone, optional Google sign-in).
  Its purchases page is `/my-purchases` (with `/my-purchases/orders/:orderId`
  and password reset pages) and lists orders across stores.
- **Per-store session** under `/store/:slug/account` (login, confirm, forgot
  password, `orders/:id`). It also has an addresses section where the buyer
  manages saved addresses.

An order does not need an account to be followed: the private link
`/store/:slug/pedido/:token` shows the order timeline, payment instructions, the
proof upload, shipping details (tracking number, tracking link and the packed
photo when the seller added them) and a button to confirm receipt.

## Other buyer entry points

- **Assisted-order link.** When a seller creates an order for a buyer (see
  [`../core/assisted-orders.md`](../core/assisted-orders.md)), the buyer gets
  the private `pedido/:token` link. From that page they can save the order to an
  account (claim it), including with Google.
- **Restock request.** A sold-out product on `/store/:slug/product/:productId`
  offers a restock-interest dialog. Requests show up in the seller's restock
  queue (see [seller-flow.md](seller-flow.md)).
- **Shipping.** Couriers the seller configured are offered at checkout when the
  delivery method is courier; tracking and the packed photo are shown on the
  order page once the seller records them.

## Related

- [seller-flow.md](seller-flow.md): the seller side of the same order.
- [marketplace-flow.md](marketplace-flow.md): how buyers find a store.
- [`../core/product.md`](../core/product.md) and
  [`../core/roadmap.md`](../core/roadmap.md): product spec and what is planned.
- [`../readme.md`](../readme.md): docs index.
