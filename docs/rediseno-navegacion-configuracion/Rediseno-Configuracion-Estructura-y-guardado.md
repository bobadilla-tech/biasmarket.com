# Configuración: estructura y guardado: join points

Issues: CFG-1 (pestañas), CFG-2 (guardado unificado), CFG-4 (eliminar duplicados).
Índice: [Rediseño: índice](Rediseno-Hub.md).

## Estado actual

| Archivo | Qué hace hoy |
|---|---|
| `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/settings/page.tsx` | Metadata y render de `SettingsPageClient`. No hay subrutas. |
| `settings/settings-page-client.tsx` (106 líneas) | Renderiza todo en una sola columna, en este orden: `ProfileSection`, `StoreContentSection`, `AppearanceSection`, `PaymentsSection`, bloque de `WhatsAppMessagesSection`, `DeliverySection`, `CouriersSection`, `DefaultsSection`, `NotificationsSection`. |
| `apps/web/features/store-settings/components/` | Una tarjeta por archivo (ver mapa abajo). Todas usan `SectionCard` y `useSavedFlash` de `section-primitives.tsx`. |
| `apps/web/features/store-settings/components/section-primitives.tsx` | Primitivas compartidas: `SectionCard`, `Field`, `ToggleRow`, `useSavedFlash`. Es el lugar natural para la barra de guardado de CFG-2. |
| `apps/web/features/store-settings/index.ts` | Exporta las secciones. |
| `apps/web/features/couriers/` | Módulo propio de couriers (`components`, `mutations`, `queries`, `schemas`). Tiene su propio guardado. |

### Mapa de tarjetas y de mutaciones (`features/store-settings/mutations/`)

| Tarjeta | Componente | Mutación | Botón de guardado |
|---|---|---|---|
| Perfil de la tienda | `profile-section.tsx` | `use-save-profile.ts` (+ subidas de logo, banner y avatar) | Submit del formulario |
| Contenido de la tienda | `store-content-section.tsx` | `use-save-store-content.ts` | Submit del formulario |
| Apariencia | `appearance-section.tsx` | `use-save-appearance.ts` | Botón propio |
| Valores por defecto (visibilidad) | `defaults-section.tsx` | `use-save-visibility.ts` | Botón propio |
| Métodos de pago | `payments-section.tsx` | `use-save-payment-methods.ts`, `use-save-payment-method-details.ts`, `use-save-deposit-percent.ts`, `use-upload-payment-qr-image.ts` | **Tres niveles** de botón: métodos, detalles por método y adelanto por método |
| Entrega | `delivery-section.tsx` | `use-save-delivery.ts` | Botón propio |
| Couriers | `features/couriers` (`CouriersSection`) | `features/couriers/mutations` | Botón propio |
| Alertas | `notifications-section.tsx` | `use-save-stock-alerts.ts` | Botón propio |
| Mensajes de WhatsApp | `whatsapp-messages-section.tsx` | `use-save-whatsapp-template.ts` (una por tipo) | Botón por mensaje |

Logos y banner: `use-upload-store-logo.ts` y `use-upload-store-header-image.ts`.

## Backend por área

| Área | Módulo en `apps/api/src/modules/` |
|---|---|
| Tienda, perfil, contenido, visibilidad, alertas | `stores` (`my-stores.controller.ts`, `stores.controller.ts`) |
| Cobros | `payment-config` |
| Entrega | `delivery-config`, `pickup-points` |
| Couriers | `couriers` |
| Plantillas de WhatsApp | `whatsapp-templates` |

Las alertas de stock se guardan en el propio `Store` (`lowStockAlertsEnabled`, `lowStockThreshold`).

## Notas para CFG-2 (guardado unificado)

- Hoy hay más de 10 botones de guardado y ninguno guarda al instante. Eso simplifica la decisión de la pregunta 4: todo se guarda con la barra.
- La barra debe orquestar varias mutaciones por pestaña. Si una falla, la sección queda marcada como con cambios (criterio de fallo parcial).
- `useSavedFlash` y el texto `t("saved")` / `t("save")` se repiten en cada tarjeta. Es el código que la barra reemplaza.
- Probar con `apps/web/features/store-settings/components/*.test.tsx` (existen para delivery, payments y whatsapp).

## Notas para CFG-4 (duplicados)

- `defaults-section.tsx` muestra la moneda (solo lectura, `store.defaultCurrency`), la URL pública con botón de copiar (`storefrontUrl`) y el interruptor de visibilidad.
- La moneda también es editable en `profile-section.tsx` (`defaultCurrency`). La URL aparece también en el encabezado del perfil. Quitar duplicados deja una sola copia en Tienda › Identidad.
