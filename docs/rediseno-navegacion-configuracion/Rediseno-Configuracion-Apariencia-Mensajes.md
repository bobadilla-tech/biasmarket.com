# Configuración: pestañas Apariencia y Mensajes: join points

Issues: CFG-7 (Apariencia), CFG-8 (alertas), CFG-9 (plantillas de WhatsApp), follow-up "Pedido cancelado".
Índice: [Rediseño: índice](Rediseno-Hub.md).

## Apariencia (CFG-7)

| Elemento | Código actual |
|---|---|
| Paletas | `packages/design-tokens/src/palette.ts`: `royal-bloom` (Royal Bloom), `midnight-luxe`, `sunset-pop`, `mint-stage` y `custom` (nombre "Custom"). |
| Selector y vista previa | `apps/web/features/store-settings/components/appearance-section.tsx` (estado local `selectedPalette`). |
| Guardado | `use-save-appearance.ts` → `settingsApi.updateAppearance` (`api/settings.api.ts`). |
| Tema de la tienda | `apps/web/lib/store-theme` (`StoreThemeConfig`, `buildStoreThemeConfig`). |

Notas:
- Los nombres de paleta están en inglés en el código. Confirmar si se traducen (decisión de marca).
- Pregunta 6 (recolorear en vivo): hoy la vista previa usa estado local y la paleta se persiste con el botón.
- Contraste WCAG AA para "Personalizado": revisar en `palette.ts` (función que calcula los colores derivados).

## Alertas (CFG-8)

| Elemento | Código actual |
|---|---|
| Tarjeta | `notifications-section.tsx` |
| Items | `newOrder`, `paymentReview` (activos), `orderDelivered` y `weeklySummary` (`locked: true`) |
| Umbral de stock | `lowStockThreshold` (`String(store.lowStockThreshold ?? 5)`) |
| Textos | `packages/i18n/es/dashboard.json` bajo `notifications` (claves `items.lowStock`, `items.newOrder`, `items.paymentReview`, `items.orderDelivered`, `items.weeklySummary`) |
| Guardado | `use-save-stock-alerts.ts` |

Notas:
- Falta el texto "Próximamente" para los dos items bloqueados.
- La bandeja de avisos (pantalla Notificaciones, `features/notifications`) no cambia.
- Pendiente: el texto interno "vista previa de los controles" hay que buscarlo en i18n antes de quitarlo (COPY-1).

## Plantillas de WhatsApp (CFG-9)

### Mapa de mensajes del issue a código

| Mensaje del issue | `WhatsAppMessageType` (schema.prisma) | Destinatario |
|---|---|---|
| Nuevo pedido | `NEW_ORDER` | Vendedor |
| Enlace de pedido asistido | `ASSISTED_ORDER_LINK` | Comprador |
| Recordatorio de pago | `PAYMENT_REMINDER` | Comprador |
| Pago validado | `ASSISTED_PAYMENT_VALIDATED` | Comprador |
| En camino | `ASSISTED_IN_TRANSIT` | Comprador |
| Listo para recoger | `ASSISTED_READY` | Comprador |
| Entregado | `ASSISTED_DELIVERED` | Comprador |

### Dónde vive cada pieza

| Pieza | Código actual |
|---|---|
| UI | `apps/web/features/store-settings/components/whatsapp-messages-section.tsx` (ya usa `getMissingRequiredTokens` y `renderWhatsAppTemplate`) |
| Guardado por tipo | `use-save-whatsapp-template.ts` |
| Lectura | `queries/use-whatsapp-templates.ts` |
| API | `apps/api/src/modules/whatsapp-templates/whatsapp-templates.controller.ts`: `GET` y `PUT` en `stores/:storeId/whatsapp-templates/:type` |
| Modelo | `WhatsAppMessageTemplate` (tabla con `storeId_type`) |
| Tokens y tokens requeridos | `packages/utils/src/whatsapp/index.ts`: `WHATSAPP_MESSAGE_TOKENS`, `WHATSAPP_REQUIRED_TOKENS`, `extractTokens`, `getMissingRequiredTokens`, `renderWhatsAppTemplate` |
| Textos por defecto | Dentro de cada `build...Message` en `packages/utils/src/whatsapp/index.ts`. **No hay una constante exportada.** |
| Uso real | `apps/api/src/modules/orders/application/create-order.usecase.ts` y las plantillas por defecto |

### Qué falta para CFG-9

- **No hace falta endpoint nuevo.** El frontend ya importa `@biasmarket/utils/whatsapp`. Basta con exportar un mapa `WHATSAPP_DEFAULT_TEMPLATES` desde ese módulo. La criterio "si no existe, se añade un endpoint de solo lectura" queda cubierto por esta opción.
- El backend devuelve `null` si la tienda no tiene fila (`findForStore`). Ese `null` significa "usa el predeterminado". Mantener esa semántica al guardar un texto igual al predeterminado.
- Riesgo: si el predeterminado se duplica en el frontend, un cambio en `utils` no se propaga. Exportarlo desde un solo lugar.

### Follow-up: "Pedido cancelado"

- `OrderStatus.CANCELLED` y `PaymentStatus.CANCELLED` existen (`schema.prisma`).
- No hay `WhatsAppMessageType` para cancelación. Agregarlo requiere migración del enum y una plantilla por defecto. Es un issue aparte, fuera de CFG-9 (ver el issue de follow-up en la épica E4).

## Copy (COPY-1)

- `packages/i18n/es/dashboard.json`: 19 coincidencias de voseo (por ejemplo "Contá quién sos", "Podés usar", "Acá aparece", "Todavía tenés", "No sos dueño" en la API).
- Revisar también mensajes de error de la API en `whatsapp-templates.service.ts` (por ejemplo, "No sos dueño de esta store"). Están en español rioplatense.
- Revisar `packages/utils/src/whatsapp/index.ts` (textos por defecto a comprador).
