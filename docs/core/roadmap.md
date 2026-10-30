# Deployment, Roadmap & Risks

Where this ships, what ships when, and what could go wrong.

## Deployment

### MVP Stack

- Host: Contabo Cloud VPS, single box, blue/green Docker Compose (see
  [deploy.md](deploy.md) and
  [architecture.md](architecture.md#8-docker--deployment))
- Reverse proxy / TLS: Caddy (auto HTTPS, no subdomain routing yet — see
  [architecture.md](architecture.md#3-multi-tenant-design-critical))
- DB: Postgres in a container on the same VPS
- Storage: self-hosted MinIO (public product images, private payment images);
  Cloudflare R2 is a spec-only option. See [operations.md](operations.md#minio)
  and [security-payments.md §10](security-payments.md#10-storage-strategy)
- Email: Resend, sent by `apps/workers` (see
  [architecture.md](architecture.md#9-performance--scaling))

### Post-MVP

- DB: move to managed Postgres (Neon / Supabase / RDS) once a single-box DB
  becomes the bottleneck
- Subdomain routing (`:slug.biasmarket.com`) once themes/store count justify it

---

## Roadmap

### MVP

- Auth (seller + buyer — see
  [product.md §5.8](product.md#58-buyer-authentication-public-storefront))
- Store creation
- Product CRUD
- Payment & delivery configuration (per store — see
  [product.md §5.4](product.md#54-payment-configuration-seller-panel) and
  [§5.5](product.md#55-delivery-methods-seller-panel))
- Order flow
- Payment recording & review — seller-recorded payments and buyer-submitted
  proofs reviewed by the seller (see
  [security-payments.md §9.2](security-payments.md#92-flow-whats-actually-live))
- Admin review
- Order expiration handling — auto-cancel unpaid `PENDING_PAYMENT` orders and
  release the stock hold (see
  [security-payments.md §9.2](security-payments.md#92-flow-whats-actually-live))
- i18n foundation — ES/EN UI strings, `User.locale`/`Store.locale` (see
  [i18n.md](i18n.md))
- Cross-store discovery layer — featured stores, store directory, global product
  search (see
  [product.md §5.10](product.md#510-discovery-layer-public-cross-store))

### v1

- Themes marketplace
- Subdomain support
- Multi-locale storefront content (bilingual same-store, see [i18n.md](i18n.md))

### v2

- Real payment integrations
- Advanced inventory management — low-stock alerts, multi-warehouse (basic
  per-variant stock and soft-hold exist, see
  [product.md §5.2](product.md#52-product-management--crud-seller-panel) and
  [security-payments.md §9.2](security-payments.md#92-flow-whats-actually-live))
- Group order system (K-pop specific)

For what each module does today, see the
[module catalog](architecture.md#api-module-catalog).

---

## Risks

- Fraud (fake payment screenshots)
- Charge disputes (manual systems)
- Scaling multi-tenant themes
- Stock griefing — buyers creating `PENDING_PAYMENT` orders on limited-stock
  items without ever paying, holding them from other buyers

Mitigation:

- Admin verification tools
- Audit logs
- Rate limiting
- Soft-hold expiration + rate limiting on order creation (see
  [security-payments.md §7.4](security-payments.md#74-abuse-prevention) and
  [§9.2](security-payments.md#92-flow-whats-actually-live))

---

## Final Notes

- Keep MVP extremely focused
- Do NOT overbuild payments
- Optimize for speed + UX
- Your edge = niche + workflow understanding

---

## Related

- [product.md](product.md): product scope the roadmap refers to.
- [architecture.md](architecture.md): modules, deployment, queues.
- [deploy.md](deploy.md), [operations.md](operations.md): running production.
- [security-payments.md](security-payments.md): payment flow and abuse controls.
