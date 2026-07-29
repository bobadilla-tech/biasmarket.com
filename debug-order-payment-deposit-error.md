[OPEN] order-payment-deposit-error

## Síntoma
- Al registrar un abono (POST `/stores/:storeId/orders/:orderId/payments`) responde:
  - "No se pudo registrar el abono. Verifica que la migración de OrderPayment esté aplicada en la base de datos"

## Hipótesis (falsables)
1) La migración que crea `OrderPayment` no está aplicada en la base de datos que usa el API → Prisma falla al ejecutar `orderPayment.create`.
2) El API está apuntando a un `DATABASE_URL` distinto al que usas para migrar (env inconsistente) → migras una DB pero el API consulta otra.
3) El Prisma Client del runtime no está regenerado luego del cambio de schema → el modelo existe en schema pero el client del API no tiene el delegate correcto.
4) La conexión a DB falla (credenciales/host) y el error se está enmascarando por el catch → no llega a crear el pago.

## Evidencia a recolectar
- `DATABASE_URL` efectivo usado por el API.
- Resultado de `prisma migrate dev` contra ese `DATABASE_URL`.

