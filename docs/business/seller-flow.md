# Seller Flow

Reflects the payment flow implemented in the app. Buyers can attach a proof
image (at checkout, on their private order page, or from their account), and the
seller reviews it in the panel (approve, reject or void). The seller can also
record a payment received over WhatsApp or another channel (amount, method,
optional note, optional image). See
[`docs/core/security-payments.md` §9](../core/security-payments.md#9-payment-flow-design-manual),
[§9.3.1](../core/security-payments.md#931-buyer-proof-upload-by-private-link)
for the buyer upload rules, and
[`docs/core/product.md` §5.9](../core/product.md#59-seller-panel-management).

```
Login (/login) → onboarding / crear tienda (primera vez)
        │
        ▼
   Dashboard (/dashboard/:slug)
        │
   Menú lateral: Resumen, Pedidos, Productos, Colecciones, Secciones,
   Envíos, Pagos | Clientes, Reposición, Analíticas, Notificaciones |
   Configuración, Preferencias
   (cada entrada es /dashboard/:slug/<entrada>; ver
   store-management-flow.md para el detalle de cada una)
   │
   ▼
Pedidos (o Pagos) → filtra por estado (PENDING_PAYMENT, PARTIALLY_PAID, …)
   │
   ▼
Selecciona un pedido pendiente
   │
   ├── Si el comprador subió un comprobante (PENDING_REVIEW):
   │      revisa la imagen → aprobar / rechazar, o anular el pago
   │
   ▼
O registra el pago recibido (OrderPayment): monto, método,
nota opcional, imagen opcional
   │
   ├── Monto parcial → PARTIALLY_PAID (sigue con soft-hold)
   │      │
   │      ▼
   │   Aprobar / rechazar desde el panel
   │      │
   │      ├── Aprueba → VERIFIED
   │      └── Rechaza → REJECTED (hold liberado; terminal en el MVP)
   │
   └── Monto suficiente para cubrir requiredAmount → pasa
       directo por la ruta de aprobación → VERIFIED
   │
   ▼
Stock descontado automáticamente (a nivel de variante si existen,
si no a nivel de producto); venta confirmada, cuenta en ventas
   │
   ▼
Orden avanza por los estados de cumplimiento:
ORDERING → IN_TRANSIT → READY → COMPLETED
(el vendedor cambia el estado manualmente en cada paso;
no se puede avanzar si el pago no está VERIFIED)


Gestión de productos (independiente del flujo de pedidos)
────────────────────────────────────────────────────────
Dashboard → Productos → Crear/editar
   │
   ▼
Nombre, descripción, precio, categoría, imágenes, variantes
   │
   ▼
Guardar como DRAFT o publicar (PUBLISHED)
   │
   ▼
Visible en /store/:slug (solo si PUBLISHED)

Marcar "sold out" manualmente, o eliminar (soft delete —
un producto referenciado por una orden existente nunca se
borra realmente, para no romper el historial de esa orden)


Si una orden se cancela (expira sin pago registrado — sweep
cada 5 min — o el vendedor la cancela):
   │
   ▼
CANCELLED — stock (soft-hold) liberado automáticamente,
sin acción del vendedor
```

Pedidos asistidos: desde Pedidos → nuevo (`/dashboard/:slug/orders/new`) el
vendedor crea una orden en nombre de un comprador y comparte el enlace privado;
ver [`../core/assisted-orders.md`](../core/assisted-orders.md).

## Related

- [buyer-flow.md](buyer-flow.md): the buyer side of the same order.
- [store-management-flow.md](store-management-flow.md): every dashboard page.
- [`../core/product.md`](../core/product.md) and
  [`../core/roadmap.md`](../core/roadmap.md): product spec and what is planned.
- [`../readme.md`](../readme.md): docs index.
