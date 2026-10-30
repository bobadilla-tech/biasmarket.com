# Rediseño del menú lateral: join points

Issues: NAV-1 (Catálogo agrupado), NAV-2 (Preferencias y Mi cuenta), NAV-3 (menú móvil).
Índice: [Rediseño: índice](Rediseno-Hub.md).

## Estado actual

| Archivo | Qué hace hoy |
|---|---|
| `apps/web/components/dashboard/store-sidebar.tsx` | Define tres grupos: `primaryItems` (overview, orders, products, collections, sections, shipping, payments), `growthItems` (customers, restock, analytics, notifications) y `settingsItems` (settings, preferences). `SidebarSection` renderiza cada grupo. |
| `apps/web/components/dashboard/store-sidebar.tsx` (líneas ~266-310) | Pie del menú: nombre y correo del usuario, y un `Link` a `/account` con la etiqueta `myAccount`. |
| `apps/web/components/dashboard/store-sidebar.tsx` (~183-200) | Colapso: estado `collapsed` y clave `store-sidebar-collapsed` en `localStorage`. En modo colapsado usa `sr-only` y `title`. |
| `apps/web/components/dashboard/mobile-sidebar.tsx` | Menú móvil existente. Lo usa `store-sidebar.tsx`. |
| `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/` | Rutas: `products`, `collections`, `sections`, `payments`, `shipping`, `preferences`, `settings`. No hay ruta `references`. |
| `apps/web/app/[locale]/(dashboard)/account/` | Pantalla "Mi cuenta" (`account-page-client.tsx`). Usa `features/my-account` (cambio de contraseña y `StoreLinkCard`). |
| `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/preferences/preferences-page-client.tsx` | Muestra sugerencias (`features/suggestions`) con descarte en `localStorage`. No contiene datos de cuenta. |
| `packages/i18n/{es,en}/dashboard.json` | Etiquetas `nav.<key>` (por ejemplo `nav.preferences`, "Preferencias" en es) y `myAccount` ("Mi cuenta"). |

## Dónde tocar cada issue

### NAV-1 · Catálogo agrupado
- Agregar un nuevo grupo o ítem padre en `store-sidebar.tsx`. Hoy `products`, `collections` y `sections` son ítems de `primaryItems`.
- Las rutas de `products`, `collections` y `sections` no cambian (la regla "sin romper enlaces" se cumple).
- `Referencias` no tiene ruta ni entidad. Se agrega detrás de un flag o se omite hasta que exista (pregunta 2).
- El submenú debe respetar el estado `collapsed` y mostrar un menú flotante en modo íconos (`store-sidebar.tsx` ya tiene ese modo).
- Traducciones: nuevas claves `nav.catalog` y `nav.references` en `packages/i18n/{es,en}/dashboard.json`.

### NAV-2 · Ajustes y Mi cuenta
- **Corrección de premisa:** "Mi cuenta" ya está en el pie (`/account`). Lo que falta es reubicar "Preferencias", que son sugerencias.
- Hoy `settingsItems` tiene `settings` y `preferences`. El cambio es quitar `preferences` de `settingsItems`.
- Decisión pendiente: a dónde van las sugerencias (por ejemplo, Resumen o Notificaciones). Si se mueven, `preferences/` debe redirigir.
- Redirección de la URL vieja: definir en `next.config` o con `redirect()` en `preferences/page.tsx`.

### NAV-3 · Menú móvil
- Partir de `mobile-sidebar.tsx`, no crear desde cero.
- Revisar el punto de quiebre actual (sugerido 860 px) y el badge de notificaciones (`badgeCount` en `store-sidebar.tsx`).
- Verificar el foco atrapado y el cierre con tecla Escape.

## Pruebas existentes
- `apps/web/components/dashboard/store-sidebar.test.tsx` y `mobile-sidebar.test.tsx`. Agregar casos para Catálogo, la ruta activa y el colapso.
