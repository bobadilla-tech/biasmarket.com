# Actualización diaria de producto y QA

**Fecha:** 2026-10-30\
**Ventana:** 00:00–18:21, hora de Lima (America/Lima, UTC−5). Equivale a
2026-10-30 05:00–23:21 UTC.\
**Repositorio:**
[bobadilla-tech/biasmarket.com](https://github.com/bobadilla-tech/biasmarket.com)\
**Alcance:** actividad del día hasta la hora de generación; modos `ambos`.

## Resumen de evidencia

- Se confirmó el repositorio con `gh repo view`, la sesión con `gh auth status`,
  el estado local, commits con autor/fecha y cambios locales. El único cambio
  local sin seguimiento es el expediente de investigación y plan para fallos de
  Mobile Release en `.artifacts/2026/10/20261030--mobile-release-failures/`; no
  hay cambios locales de código.
- Se consultaron issues y PRs con actividad en las fechas UTC que cubren la
  ventana, y se filtraron por las marcas de tiempo exactas. Se revisaron los PRs
  relevantes, sus archivos, descripciones y verificaciones; también se
  consultaron las ejecuciones de CD y el sitio público.
- **Tienda pública, desplegada:** PR
  [#489](https://github.com/bobadilla-tech/biasmarket.com/pull/489) agregó
  controles para volver de página y ver el número de página, manteniendo la
  carga progresiva del catálogo. Cerró el reporte
  [#486](https://github.com/bobadilla-tech/biasmarket.com/issues/486). PR
  [#490](https://github.com/bobadilla-tech/biasmarket.com/pull/490) corrigió el
  contraste del texto de la pestaña seleccionada. Ambos tienen CI exitoso. CD
  [41083309441](https://github.com/bobadilla-tech/biasmarket.com/actions/runs/41083309441)
  terminó con éxito después de #489; CD
  [41132079557](https://github.com/bobadilla-tech/biasmarket.com/actions/runs/41132079557)
  terminó con éxito después de #490. La página de
  [KoreaLexa en producción](https://biasmarket.com/es/store/korealexa?tab=productos)
  respondió HTTP 200. La validación pública confirma disponibilidad, pero no
  comprueba por sí sola todos los criterios del reporte original en todas las
  tiendas y filtros.
- **Ampliación de categorías y referencias, aún no disponible:** PR
  [#496](https://github.com/bobadilla-tech/biasmarket.com/pull/496) está
  abierto. Incluye administración de categorías y referencias, galería pública y
  cambios de SEO, pero el chequeo `API` y el agregado `CI Success` fallaron en
  la ejecución consultada. No se encontró un despliegue para ese PR, así que no
  se presenta como completado ni se pide probarlo.
- **Diagnóstico y monitoreo:** PRs
  [#530](https://github.com/bobadilla-tech/biasmarket.com/pull/530),
  [#532](https://github.com/bobadilla-tech/biasmarket.com/pull/532) y
  [#537](https://github.com/bobadilla-tech/biasmarket.com/pull/537) mejoran el
  muestreo de trazas, los registros de solicitudes de la API y el reporte de
  errores y trabajos fallidos. Sus verificaciones de CI pasaron. CD
  [41140074273](https://github.com/bobadilla-tech/biasmarket.com/actions/runs/41140074273)
  completó con éxito después de #537. La guía operativa quedó en PR
  [#547](https://github.com/bobadilla-tech/biasmarket.com/pull/547), fusionado
  con CI exitoso. Los siguientes pasos de seguridad/alertas/conexión siguen en
  los issues abiertos
  [#533–#536](https://github.com/bobadilla-tech/biasmarket.com/issues/533).
- **Pedidos y privacidad:** PR
  [#467](https://github.com/bobadilla-tech/biasmarket.com/pull/467) agrega
  auditoría de acciones del pedido asistido y limpieza ante fallo de carga; PR
  [#468](https://github.com/bobadilla-tech/biasmarket.com/pull/468) oculta
  tokens sensibles de enlaces y limita datos demasiado profundos en reportes de
  errores. Ambos se fusionaron con CI exitoso y hubo despliegues CD exitosos
  [41006762919](https://github.com/bobadilla-tech/biasmarket.com/actions/runs/41006762919)
  y
  [41007353763](https://github.com/bobadilla-tech/biasmarket.com/actions/runs/41007353763).
  La verificación de registros y telemetría reales de producción sigue pendiente
  en [#463](https://github.com/bobadilla-tech/biasmarket.com/issues/463); el
  código fusionado no cierra esa comprobación operativa.
- **Pruebas y mantenimiento:** PRs
  [#492](https://github.com/bobadilla-tech/biasmarket.com/pull/492) y
  [#493](https://github.com/bobadilla-tech/biasmarket.com/pull/493) amplían
  pruebas de recorridos web de comprador, invitaciones y navegadores integrados;
  [#484](https://github.com/bobadilla-tech/biasmarket.com/pull/484) amplía
  pruebas del pedido asistido. PR
  [#481](https://github.com/bobadilla-tech/biasmarket.com/pull/481) hace
  configurables los puertos locales de Postgres y Redis y cierra
  [#402](https://github.com/bobadilla-tech/biasmarket.com/issues/402). PRs
  [#495](https://github.com/bobadilla-tech/biasmarket.com/pull/495),
  [#517](https://github.com/bobadilla-tech/biasmarket.com/pull/517) y
  [#531](https://github.com/bobadilla-tech/biasmarket.com/pull/531) actualizan
  dependencias y herramientas de desarrollo. Son cambios técnicos, no nuevas
  funciones para probar.
- **Mobile Release, reparación parcial:** PR
  [#548](https://github.com/bobadilla-tech/biasmarket.com/pull/548) se fusionó
  con CI exitoso e incluye `babel-preset-expo` como dependencia directa de la
  app. La verificación de exportación Android/iOS ya pasa ese punto, pero se
  detiene después por imports existentes que buscan `session-context.js`
  mientras el archivo disponible es `session-context.tsx`. Por eso, aún no se
  comprobó un build nativo completo ni se publicó un tag con la reparación; el
  CD general actualmente está en curso
  ([41143913028](https://github.com/bobadilla-tech/biasmarket.com/actions/runs/41143913028))
  y no demuestra que el paquete móvil esté listo para distribuir. La tarea
  restante está documentada en el expediente local.
- **Trabajo de producto planificado:** hoy se abrieron grupos de seguimiento
  para navegación y configuración (#501), referencias/tienda móvil (#529),
  pedidos en móvil (#546) y tarjetas de productos en móvil (#549). Son tickets
  abiertos, no trabajo entregado.

## Diferencias entre lo pedido y lo entregado

- El reporte [#486](https://github.com/bobadilla-tech/biasmarket.com/issues/486)
  pedía visibilidad completa de productos publicados con filtros y orden
  correctos en todas las tiendas. #489 aporta navegación de páginas y paginación
  accesible, y la tienda usada para la verificación carga en producción. La
  evidencia revisada no demuestra todos los filtros ni todos los escenarios en
  todas las tiendas; limitar la afirmación a la navegación de catálogo que se
  desplegó.
- La mejora de referencias/categorías de #496 todavía no está lista para uso: PR
  abierto, CI de API fallido y sin despliegue verificado.
- La reparación del preset móvil cubre solo la dependencia faltante. La
  exportación de producción sigue detenida en el problema de imports
  `session-context`, y falta validar los builds nativos con un tag nuevo.
- La redacción de tokens está desplegada, pero queda confirmar en evidencia de
  producción que los registros y eventos reales no exponen esos valores (#463).

## Estado de publicación y QA

- Desplegado y accesible: paginación del catálogo (#489) y contraste de pestañas
  (#490); la página pública de KoreaLexa respondió HTTP 200.
- Desplegado: trabajo de monitoreo de los PRs #530, #532 y #537; la ejecución CD
  #41140074273 concluyó con éxito.
- Fusionado, pero falta validación operativa: privacidad/redacción de #468;
  issue #463 sigue abierto.
- Fusionado, sin build de lanzamiento móvil completo: #548; el export encontró
  el bloqueo independiente de `session-context`.
- En trabajo y no disponible para QA: #496; el chequeo API falló y no hay
  despliegue verificado.
- **QA manual recomendado:** revisar la tienda pública desplegada, en especial
  el texto de la pestaña activa y la navegación del catálogo. No pedir pruebas
  de API, monitoreo o cambios internos.

## Mensaje listo para copiar

¡Hola! Hoy corregimos dos detalles visibles de la tienda: ahora es más fácil
volver entre páginas del catálogo y el texto de la pestaña seleccionada se lee
mejor. Ya están disponibles en la tienda pública.

¿Puedes revisar la tienda de
[KoreaLexa](https://biasmarket.com/es/store/korealexa?tab=productos)?

1. Abre la pestaña **Productos** y confirma que el nombre de la pestaña activa
   se lea con claridad.
2. Avanza a otra página del catálogo y vuelve a la anterior.
3. Comprueba que los productos sigan visibles y que no aparezcan repetidos al
   cambiar de página.

Cuéntame si algo se ve confuso o falla. Si puedes, comparte una captura.

También mejoramos los registros de errores para facilitar el diagnóstico cuando
algo falla. La nueva vista de categorías y referencias sigue en revisión y
todavía no está disponible para probar.
