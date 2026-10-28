# Ticket drafts (NOT created; needs human approval of the exact text)

Labels: `pedido-asistido` plus the type label. Each body ends with a pointer to
the plan (`.artifacts/2026/10/20261027--assisted-order-buyer-page/plan.md`,
"USER DIRECTION") and the PR that deferred it.

## Close after merge and verification

| Ticket | Closed by      | Note                                                                                       |
| ------ | -------------- | ------------------------------------------------------------------------------------------ |
| #268   | #358           | only after the follow-ups below exist; header proof for `/pedido/*` is deferred (ticket 4) |
| #333   | #359           | the PR's e2e must fail on its base commit (see review notes)                               |
| #337   | #361           |                                                                                            |
| #265   | already closed | #360 only references it; optional trace ticket T0                                          |

## Refine (not close)

- #340: rewrite premise per T1 (the leak is Caddy's default error logger, not
  access logs; probe results in plan 4.3).

## T0 (optional trace) · enhancement · `pedido-asistido`, `backend`, `frontend`, `vendor-panel`

Título: Lista de otros pedidos del mismo número en el detalle del pedido
asistido Cuerpo: Entregado en #360 (refs #265). Cerrar al mergear #360.

## T1 · bug · `pedido-asistido`, `security`

Título: Caddy: el logger de errores por defecto escribe el token del pedido, y
el Caddyfile montado como archivo puede quedar con el inode viejo Cuerpo: Con el
upstream caído (503 "no upstreams available" por `health_uri`, o 502) el logger
`http.log.error` escribe `request.uri` (`/api/public/orders/<token>`,
`/es/store/x/pedido/<token>`) y `request.headers.Referer`. Pasa en cada corte de
blue/green. Además `docker-compose.yml` monta el Caddyfile como archivo único y
`cd.yml` hace rsync con `--delay-updates` (rename a un inode nuevo): el
contenedor puede conservar el archivo viejo y `caddy reload` sale con 0, así que
`trusted_proxies` de #343 podría no estar activo. Propuesta y resultados de
pruebas: plan sección 4.3. Reemplaza la premisa de #340 (access logs). Refs
#340, #279.

## T2 · enhancement · `pedido-asistido`, `security`, `frontend`

Título: Web: quitar el token del pedido de los eventos de Sentry/GlitchTip
Cuerpo: `beforeSend`, `beforeBreadcrumb`, `beforeSendTransaction` en cliente y
servidor, y `onRequestError` (pathname, message, digest; sin leer
`request.headers`). No hacer `JSON.stringify` de un evento de transacción tal
cual: `sdkProcessingMetadata` es circular y el SDK envía un TypeError en su
lugar. Probar con un transport falso que llega un item `transaction`. Refs #279,
#358.

## T3 · enhancement · `pedido-asistido`, `security`, `backend`

Título: Endurecer la API pública del pedido (token, DTO, eventos) Checklist:
guard de formato de token en `requireOrderForToken`; `credentials: "omit"` en la
query pública (el mutator hoy ignora el valor por llamada); minimizar DTO
(`line1`/`reference`, alias como primer nombre); sin TTL del token ni
minimización tras completar; `INVITE_CLICKED`/`INVITE_DISMISSED` sin dedupe;
allow-list de `paymentMethods[].details` en la API. Refs #279, #358.

## T4 · enhancement · `pedido-asistido`, `security`, `qa`

Título: CI: probar los headers de `/pedido/*` (página, variante RSC, redirect
sin prefijo) Cuerpo: curl en `scripts/ci/web-e2e.sh` (`-H 'RSC: 1'`,
`--max-redirs 0`); fallback en `proxy.ts` si next-intl pisa
`Cache-Control`/`Referrer-Policy` (ver resultado del review en review-notes);
test de sitemap: ninguna fuente emite `/pedido/`. Refs #358.

## T5 · bug · `pedido-asistido`, `security`, `backend`, `buyer`

Título: Checkout: identidad (teléfono ocupado, email sensible a mayúsculas,
carrera con crear cuenta Google) Cuerpo: checkout con el teléfono de una víctima
y el email del atacante; comparación de email sensible a mayúsculas en
`findOrCreateCustomer`; la ruta de creación Google compite con un checkout del
mismo email. Refs #333, #359.

## T6 · (rellenar con los hallazgos aplazados por los reviews; enlazar #336 y #339 en vez de duplicar)
