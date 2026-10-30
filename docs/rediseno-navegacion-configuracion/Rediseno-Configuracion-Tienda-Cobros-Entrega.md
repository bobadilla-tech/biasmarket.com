# Configuración: pestañas Tienda, Cobros y Entrega: join points

Issues: CFG-3 (Tienda), CFG-5 (Cobros), CFG-6 (Entrega).
Índice: [Rediseño: índice](Rediseno-Hub.md).

## Tienda (CFG-3)

| Bloque del issue | Código actual |
|---|---|
| Identidad: logo, banner, nombre, moneda, idioma, ubicación | `profile-section.tsx` (`defaultCurrency`, `locale`, `SUPPORTED_CURRENCIES` de `@biasmarket/utils/currency`) |
| URL de la tienda (copiar) | `defaults-section.tsx` (`storefrontUrl`) y encabezado de `profile-section.tsx` |
| Redes sociales | `profile-section.tsx` |
| Bio (máx. 280) y "Sobre la tienda" (Markdown, máx. 4000) | `store-content-section.tsx` (`BIO_MAX_LENGTH`, `ABOUT_MARKDOWN_MAX_LENGTH`) |
| "Mostrar en inicio y búsqueda" | `defaults-section.tsx` (`useSaveVisibility`) |
| Perfil público del dueño (avatar y nombre) | `profile-section.tsx` (`uploadOwnerAvatar`) |
| Instrucciones de pago (salen de aquí) | Se mueven a Cobros. Hoy están en `payments-section.tsx`. |

Notas:
- Los formatos de banner (3:1, máx. 5 MB, JPG o PNG) están en `profile-section.tsx`. Verificar que no se pierdan al reorganizar.
- La vista previa lateral es nueva. Reutilizar `apps/web/components/dashboard/store-theme-frame.tsx` si sirve, o `StoreLogo` (`components/store-logo.tsx`).

## Cobros (CFG-5)

| Elemento | Código actual |
|---|---|
| Métodos (enum) | `PaymentMethodType`: `YAPE`, `PLIN`, `TRANSFER`, `CASH` (`packages/db/prisma/schema.prisma`) |
| Toggles de métodos | `payments-section.tsx`, `enabledByMethod` (estado local, se guarda con `useSavePaymentMethods`) |
| Datos del método ("Editar datos") | `payments-section.tsx` (`hasDetails`, `isExpanded`, `handleSaveDetails`). `CASH` no tiene detalles. |
| QR | `use-upload-payment-qr-image.ts` |
| Adelanto (porcentaje 1 a 100) | `payments-section.tsx` (`min={1}`, `max={100}`), `use-save-deposit-percent.ts` |
| Instrucciones de pago | Hoy en `payments-section.tsx` o perfil (confirmar al implementar). |
| Backend | `apps/api/src/modules/payment-config` |

Notas:
- **Decisión de producto:** el adelanto hoy se guarda **por método**, con un botón por fila (`handleSaveDepositPercent(method.method)`). El issue pide un único campo. Hay que decidir si se unifica en una sola regla y cómo se migran los valores existentes.
- Pendiente de datos: logos reales de Yape, Plin, BCP e Interbank (pregunta 9).
- El checkout (`features/checkout/components/checkout-form.tsx`) no debe mostrar campos de comprobante si no hay métodos configurados. Revisar esa regla en la prueba QA-1.
- Pagos (menú) es el trabajo diario. La nota de la pestaña debe enlazar a `payments/`.

## Entrega (CFG-6)

| Elemento | Código actual |
|---|---|
| Retiro presencial y puntos de recojo | `delivery-section.tsx` (`useSaveDelivery`), `queries/use-delivery-settings.ts`. Backend: `pickup-points`, `delivery-config`. |
| Envío por courier (costo estimado) | `delivery-section.tsx` |
| Couriers (lista, agencia, domicilio, "Agregar courier") | `features/couriers` (`CouriersSection`, se renderiza en `settings-page-client.tsx`). Backend: `couriers`. |

Notas:
- Hoy son dos guardados separados: uno para `delivery-section.tsx` y otro para couriers. La barra de CFG-2 los unifica por pestaña.
- Pendiente de negocio: qué pasa al quitar un punto o courier con pedidos asociados (pregunta 8).
- Ver los tests existentes: `delivery-section.test.tsx`.
