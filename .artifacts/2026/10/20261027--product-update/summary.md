# Resumen de producto: últimas dos semanas

## Alcance

- **Fecha del informe:** 2026-10-27
- **Ventana:** 2026-10-13 00:00 a 2026-10-27 19:12, hora de Lima (UTC−5). La
  última fecha cubre hasta el momento de generar este resumen.
- **Repositorio:**
  [bobadilla-tech/biasmarket.com](https://github.com/bobadilla-tech/biasmarket.com)
- **Modo:** ambos, progreso y decisión de QA

## Evidencia interna

Se consultaron el estado y el historial local de Git, commits del repositorio
entre 2026-10-13T05:00Z y 2026-10-28T00:12Z (286 commits; el primero del periodo
es del 15 de octubre), issues y PRs modificados durante la ventana, los detalles
de PRs representativos, checks, y el historial de despliegues. GitHub CLI
confirmó el repositorio correcto. El checkout está limpio y `main` coincide con
`origin/main`.

### Cambios de producto

- **Catálogo público de tiendas:** en producción están el nuevo encabezado
  visual, el perfil público opcional del dueño, el diseño de catálogo por tienda
  y las pestañas Productos, Categorías y Referencias. Las pestañas conservan la
  selección en la URL. PRs
  [#318](https://github.com/bobadilla-tech/biasmarket.com/pull/318),
  [#319](https://github.com/bobadilla-tech/biasmarket.com/pull/319),
  [#320](https://github.com/bobadilla-tech/biasmarket.com/pull/320),
  [#321](https://github.com/bobadilla-tech/biasmarket.com/pull/321) y
  [#346](https://github.com/bobadilla-tech/biasmarket.com/pull/346),
  relacionados con
  [#283](https://github.com/bobadilla-tech/biasmarket.com/issues/283),
  [#284](https://github.com/bobadilla-tech/biasmarket.com/issues/284),
  [#287](https://github.com/bobadilla-tech/biasmarket.com/issues/287),
  [#288](https://github.com/bobadilla-tech/biasmarket.com/issues/288) y
  [#289](https://github.com/bobadilla-tech/biasmarket.com/issues/289). PR #321
  reportó CI completo exitoso; PR #346 reportó CI completo exitoso.
- **Acceso y cuenta:** se fusionaron el acceso de vendedores con Google, el
  acceso de compradores con Google, la página global “Mis compras” y la
  recuperación de contraseña para compradores. También se publicaron las páginas
  de privacidad y términos. PRs
  [#305](https://github.com/bobadilla-tech/biasmarket.com/pull/305),
  [#306](https://github.com/bobadilla-tech/biasmarket.com/pull/306),
  [#307](https://github.com/bobadilla-tech/biasmarket.com/pull/307),
  [#308](https://github.com/bobadilla-tech/biasmarket.com/pull/308),
  [#310](https://github.com/bobadilla-tech/biasmarket.com/pull/310) y
  [#312](https://github.com/bobadilla-tech/biasmarket.com/pull/312). Los checks
  de CI consultados para #305, #308 y #310 fueron exitosos. Los PRs señalan que
  algunos flujos OAuth dependen de la configuración de Google en producción; no
  se verificó un inicio de sesión real con una cuenta.
- **Pedidos asistidos:** la base de pedidos y el flujo del vendedor para crear
  un pedido y compartirlo por WhatsApp se fusionaron en
  [#313](https://github.com/bobadilla-tech/biasmarket.com/pull/313) y
  [#324](https://github.com/bobadilla-tech/biasmarket.com/pull/324)–[#331](https://github.com/bobadilla-tech/biasmarket.com/pull/331),
  con correcciones posteriores en
  [#344](https://github.com/bobadilla-tech/biasmarket.com/pull/344). Sin
  embargo, la página pública que necesita el comprador sigue pendiente en
  [#268](https://github.com/bobadilla-tech/biasmarket.com/issues/268), que
  continúa abierta. Por eso el recorrido completo vendedor-comprador aún no está
  listo para promover ni pedir que se pruebe. La implementación relacionada con
  pagos sigue en el PR abierto
  [#347](https://github.com/bobadilla-tech/biasmarket.com/pull/347); al cierre
  del informe sus checks de API y E2E fallaban y Codacy requería acción.
- **Aplicación móvil:** se fusionaron autenticación de compradores, catálogo
  público y carrito por tienda en
  [#220](https://github.com/bobadilla-tech/biasmarket.com/pull/220),
  [#223](https://github.com/bobadilla-tech/biasmarket.com/pull/223) y
  [#231](https://github.com/bobadilla-tech/biasmarket.com/pull/231). La
  configuración de publicación sigue abierta en
  [#237](https://github.com/bobadilla-tech/biasmarket.com/pull/237); no hay
  evidencia de una versión publicada en las tiendas de aplicaciones. Se reporta
  como avance en desarrollo, no como una app disponible.

### Mantenimiento técnico

Se mejoraron la selección de pruebas E2E de API y la estabilidad del CI, y se
actualizaron dependencias. Referencias:
[#222](https://github.com/bobadilla-tech/biasmarket.com/pull/222),
[#227](https://github.com/bobadilla-tech/biasmarket.com/pull/227),
[#240](https://github.com/bobadilla-tech/biasmarket.com/pull/240),
[#224](https://github.com/bobadilla-tech/biasmarket.com/pull/224) y
[#225](https://github.com/bobadilla-tech/biasmarket.com/pull/225). Son mejoras
internas, no funciones visibles para clientes.

### Publicación y límites de verificación

- GitHub registra 115 despliegues de producción durante la ventana. El más
  reciente dentro del periodo es el despliegue
  [#7372842778](https://github.com/bobadilla-tech/biasmarket.com/deployments/7372842778):
  estado `success`, rama `main`, commit `0e8d8ace` (incluye los cambios
  fusionados hasta el PR #346). El sitio
  [biasmarket.com/es](https://biasmarket.com/es) respondió HTTP 200 al generar
  el informe.
- La autenticación OAuth no se ejecutó con una cuenta real. Tampoco se verificó
  una tienda pública concreta ni una cuenta de pruebas para recorrer el catálogo
  de punta a punta. No se infieren resultados para esos recorridos.
- Issues recientes que siguen abiertos incluyen la página compradora del pedido
  asistido [#268](https://github.com/bobadilla-tech/biasmarket.com/issues/268),
  un caso de concurrencia en checkout
  [#333](https://github.com/bobadilla-tech/biasmarket.com/issues/333) y
  contactos sin pedidos en el panel
  [#337](https://github.com/bobadilla-tech/biasmarket.com/issues/337). No se
  presentan como resueltos.

## Mensaje listo para copiar

Durante estas dos semanas avanzamos en varias partes visibles de Bias Market:

- Renovamos las páginas de las tiendas para que sea más fácil recorrer el
  catálogo. Ahora tienen un encabezado más claro, pueden mostrar el perfil
  público del dueño y organizan el catálogo en Productos, Categorías y
  Referencias.
- Mejoramos el acceso para vendedores y compradores con Google. Los compradores
  también pueden consultar pedidos de distintas tiendas desde “Mis compras” y
  recuperar su contraseña. Añadimos las páginas de privacidad y términos.
- Avanzamos en los pedidos asistidos: el vendedor ya puede preparar un pedido y
  compartirlo por WhatsApp. La página que debe abrir el comprador todavía está
  pendiente, así que el recorrido completo aún no está listo para usar.
- La aplicación móvil también avanzó con catálogo, inicio de sesión y carrito
  por tienda, pero todavía no está publicada para descarga.

Los cambios web principales ya están desplegados en
[biasmarket.com](https://biasmarket.com). **Esta vez no hace falta pedir QA
manual**: no pude confirmar una tienda pública concreta para probar el nuevo
catálogo de punta a punta, y el flujo de pedido asistido sigue pendiente de la
página para compradores. No probé el acceso con Google usando una cuenta real.
