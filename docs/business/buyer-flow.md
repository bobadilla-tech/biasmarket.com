# Buyer Flow

Reflects the actual proof-of-payment order flow implemented in the app — see
[`docs/core/security-payments.md` §9](../core/security-payments.md#9-payment-flow-design-manual)
and
[`docs/core/product.md` §5.6–5.7](../core/product.md#56-checkout--order-creation-flow)
for the technical/product-level source of truth this diagram follows.

(Previous version of this doc described a WhatsApp-coordination flow —
`awaiting_payment` → seller confirms over WhatsApp → `payment_confirmed`. That
was never what got built; the real flow is in-app proof upload + seller review
in the dashboard, no WhatsApp handoff required.)

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
   Página del producto (/store/:slug/products/:id)
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
        • Expira sola si no se sube comprobante (ventana configurable)
        │
        ▼
   Sube comprobante de pago (imagen)
        │
        ▼
   PAYMENT_SUBMITTED — esperando revisión del vendedor
        │
        ▼
   Vendedor revisa en su panel
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

Si la orden expira sin comprobante: `PENDING_PAYMENT` → `CANCELLED`
automáticamente, sin acción del vendedor, hold liberado.
