# Buyer Flow

Reflects the actual payment flow implemented in the app — checkout hands the
buyer off to WhatsApp to pay, and the seller records what was received — see
[`docs/core/security-payments.md` §9](../core/security-payments.md#9-payment-flow-design-manual)
and
[`docs/core/product.md` §5.6–5.7](../core/product.md#56-checkout--order-creation-flow)
for the technical/product-level source of truth this diagram follows.

(There is **no in-app proof upload** in the MVP: `PaymentProof` is schema-only.
The buyer pays over WhatsApp — or through whatever the seller shares — and the
seller records the payment in the panel.)

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
   El vendedor registra lo recibido en su panel
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
