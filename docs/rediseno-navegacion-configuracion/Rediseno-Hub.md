# Rediseño de navegación y Configuración: índice

Documento de trabajo que acompaña a las épicas del rediseño del menú lateral y de Configuración.
Fuente de requisitos: documento de issues del rediseño (`7b942f10-issues-rediseno-configuracion-biasmarket.md`).
Referencia visual: `configuracion-biasmarket.html` (prototipo; no es fuente de datos).

Cada página de esta wiki indica **dónde vive hoy el código** (join points) para que el issue apunte a archivos reales.

## Páginas

- [Menú lateral](Rediseno-Menu-lateral.md): NAV-1, NAV-2, NAV-3.
- [Configuración: estructura y guardado](Rediseno-Configuracion-Estructura-y-guardado.md): CFG-1, CFG-2, CFG-4.
- [Configuración: Tienda, Cobros y Entrega](Rediseno-Configuracion-Tienda-Cobros-Entrega.md): CFG-3, CFG-5, CFG-6.
- [Configuración: Apariencia y Mensajes](Rediseno-Configuracion-Apariencia-Mensajes.md): CFG-7, CFG-8, CFG-9.

## Épicas

| Épica | Resultado para el vendedor | Issues |
|---|---|---|
| E1 · Menú más claro | Encuentra cada sección sin confundir Preferencias con Configuración | NAV-1, NAV-2, NAV-3 |
| E2 · Configuración en pestañas con guardado seguro | Entra a Configuración y guarda sin perder cambios | CFG-1, CFG-2, CFG-4 |
| E3 · Pestañas de datos de la tienda | Edita tienda, cobros, entrega y apariencia en su pestaña | CFG-3, CFG-5, CFG-6, CFG-7 |
| E4 · Mensajes y cierre | Personaliza mensajes de WhatsApp con seguridad y el texto queda en tuteo | CFG-8, CFG-9, follow-up "Pedido cancelado", COPY-1, QA-1 |

## Preguntas abiertas: respuesta según el código

| # | Pregunta original | Respuesta verificada | Dónde se verificó |
|---|---|---|---|
| 1 | ¿Qué contiene hoy "Preferencias"? | **Sugerencias, no datos de cuenta.** Muestra tarjetas `SuggestionCard` y guarda los descartes en `localStorage` (`suggestions-dismissed-<storeId>`). No hay correo, contraseña ni idioma. | `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/preferences/preferences-page-client.tsx` |
| 2 | ¿Qué es "Referencias"? | **No existe en el código**: ni ítem de menú, ni ruta, ni entidad. Sigue como pregunta de producto. | búsqueda en `apps/web` sin resultados |
| 3 | ¿"Pedido cancelado" existe como estado? | **Sí.** `OrderStatus.CANCELLED` y `PaymentStatus.CANCELLED`. No tiene plantilla de WhatsApp. | `packages/db/prisma/schema.prisma` |
| 4 | ¿Los toggles guardan al instante? | **No, hoy ninguno guarda al instante.** Cada tarjeta tiene su botón. Los toggles de Cobros (`enabledByMethod`) y de Alertas usan estado local. | `payments-section.tsx`, `notifications-section.tsx`, `defaults-section.tsx` |
| 5 | ¿Un endpoint por tarjeta o por pestaña? | **Un hook de mutación por tarjeta** (13 en `features/store-settings/mutations`, más las de couriers). No hay endpoint por pestaña. La barra de CFG-2 orquesta varias llamadas. | `apps/web/features/store-settings/mutations/` |
| 6 | ¿La paleta recolorea todo en vivo? | **Pendiente de decisión.** Hoy la paleta se guarda con `useSaveAppearance` (botón de la tarjeta). | `appearance-section.tsx`, `use-save-appearance.ts` |
| 7 | ¿Hay menú colapsado a íconos? | **Sí.** Clave `store-sidebar-collapsed` en `localStorage` y modo solo íconos con `title`. Existe también un menú móvil. | `apps/web/components/dashboard/store-sidebar.tsx`, `mobile-sidebar.tsx` |
| 8 | ¿Qué pasa al quitar un punto o courier con pedidos? | **Pendiente de negocio.** Sin verificar en código. | — |
| 9 | Logos de Yape, Plin, BCP e Interbank | **Pendiente.** Hoy los métodos usan íconos genéricos (confirmar al implementar CFG-5). | — |

## Hallazgos que cambian los issues

1. **NAV-2:** "Mi cuenta" ya existe en el pie del menú (`/account`). Lo que falta es mover "Preferencias" (sugerencias), que no contiene datos personales. Ver [Menú lateral](Rediseno-Menu-lateral.md).
2. **NAV-3:** ya existe `mobile-sidebar.tsx`. El issue pasa de "crear" a "ajustar" el menú móvil.
3. **CFG-4:** depende solo de CFG-3. La moneda, la URL y el interruptor de visibilidad se mueven a Tienda, no a Cobros.
4. **CFG-5:** el adelanto hoy se guarda **por método** (`handleSaveDepositPercent(method.method)`), no como un único campo. Hay que decidir si se unifica.
5. **CFG-8:** "Pedido entregado" y "Resumen semanal" ya están marcados como `locked: true` en `notifications-section.tsx`. Falta el texto "Próximamente" en la UI.
6. **CFG-9:** no hace falta un endpoint nuevo para el texto por defecto. `packages/utils/src/whatsapp` ya exporta tokens requeridos, tokens por mensaje y `renderWhatsAppTemplate`, y el frontend ya lo importa. Solo falta exportar el texto por defecto de cada mensaje, que hoy está dentro de cada `build...Message`.
7. **COPY-1:** hay 19 coincidencias de voseo en `packages/i18n/es/dashboard.json` (por ejemplo "Contá quién sos", "Podés usar", "Acá aparece").
