# Seller Flow

Reflects the actual proof-of-payment review flow — see
[`docs/core/security-payments.md` §9](../core/security-payments.md#9-payment-flow-design-manual)
and
[`docs/core/product.md` §5.9](../core/product.md#59-seller-panel-management).

(Previous version described "Verificar pago" happening over a WhatsApp
conversation with a manual "Mark as Paid" button. That's not the built flow —
review happens against an uploaded proof image inside the dashboard, no WhatsApp
step.)

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
Pedidos → filtra por estado
   │
   ▼
Selecciona un pedido en PAYMENT_SUBMITTED
   │
   ▼
Ve el comprobante de pago subido por el comprador
   │
   ▼
Revisa (aprobar / rechazar)
   │
   ┌────┴────┐
   ▼         ▼
Aprueba    Rechaza
   │         │
   ▼         ▼
VERIFIED   REJECTED
   │         │
   │         ▼
   │      Stock (soft-hold) liberado automáticamente
   │
   ▼
Stock descontado automáticamente (a nivel de variante si existen,
si no a nivel de producto)
   │
   ▼
Orden avanza por los estados de cumplimiento:
ORDERING → IN_TRANSIT → READY → COMPLETED
(el vendedor cambia el estado manualmente en cada paso)


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


Si una orden se cancela (expira sin comprobante, o el
comprador la abandona):
   │
   ▼
CANCELLED — stock (soft-hold) liberado automáticamente,
sin acción del vendedor
```
