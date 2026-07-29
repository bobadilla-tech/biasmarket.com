[OPEN] orders-internal-server-error

## Síntoma
- En el dashboard, la vista de Pedidos no muestra pedidos y la API responde `Internal server error`.

## Alcance
- Endpoint esperado: `GET /api/stores/:storeId/orders`
- Contexto reciente: se agregó soporte de pagos parciales (`OrderPayment`, `PaymentStatus.PARTIALLY_PAID`) y un endpoint `POST /orders/:orderId/payments`.

## Hipótesis (falsables)
1) La base de datos no tiene aplicada la migración para `OrderPayment` o el enum `PaymentStatus`, y Prisma falla al hacer `include: { payments: ... }`.
2) El Prisma Client del runtime está desactualizado respecto al schema (types OK en TS, pero runtime/edge viejo) y falla con relación/enum no existente.
3) El filtro `paymentStatus` llega como string inválido (query param) y Prisma lanza error al construir `where`.
4) Hay un error de conexión/credenciales a DB que afecta solo este módulo/consulta (por ejemplo, diferencia de datasource o transacción).

## Evidencia a recolectar
- Stacktrace exacto del API (Nest) cuando se llama `GET /stores/:storeId/orders`.
- Código y mensaje de error Prisma (P20xx / P10xx).

## Próximos pasos
- Reproducir el request y capturar el stacktrace.
- Confirmar hipótesis y aplicar fix mínimo.

