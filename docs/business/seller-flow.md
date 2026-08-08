# Seller Flow

Reflects the actual payment flow — the seller records what the buyer sent over
WhatsApp and approves/rejects from the panel — see
[`docs/core/security-payments.md` §9](../core/security-payments.md#9-payment-flow-design-manual)
and
[`docs/core/product.md` §5.9](../core/product.md#59-seller-panel-management).

(There is **no buyer-uploaded proof image** to review in the MVP: `PaymentProof`
is schema-only. Payment happens over WhatsApp and the seller records the
`OrderPayment` themselves — amount, method, optional note, optional image.)

```
Login (dashboard, per store)
        │
        ▼
   Dashboard (/dashboard/:slug)
        │
   ┌────┼──────────────┬───────────────┬──────────────┐
   ▼    ▼               ▼               ▼              ▼
Productos  Pedidos   Categorías/   Pago y entrega   Configuración
                      Colecciones   (métodos, depósito %,
                                     puntos de recojo)
   │
   ▼
Pedidos → filtra por estado (PENDING_PAYMENT, PARTIALLY_PAID, …)
   │
   ▼
Selecciona un pedido pendiente
   │
   ▼
Registra el pago recibido (OrderPayment): monto, método,
nota opcional, imagen opcional
   │
   ├── Monto parcial → PARTIALLY_PAID (sigue con soft-hold)
   │
   └── Monto suficiente para cubrir requiredAmount → pasa
       directo por la ruta de aprobación → VERIFIED
   │
   ▼
Aprobar / rechazar
   │
   ┌────┴────┐
   ▼         ▼
Aprueba    Rechaza
   │         │
   ▼         ▼
VERIFIED   REJECTED
   │         │
   │         ▼
   │      Hold liberado; rechazo terminal (sin reapertura)
   │      en el MVP
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
