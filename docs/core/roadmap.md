# Deployment, Roadmap & Risks

Where this ships, what ships when, and what could go wrong.

## 11. Deployment

### MVP Stack

- Host: Hetzner VPS — single box, docker compose (`web`, `api`, `db` images)
- Reverse proxy / TLS: Caddy (auto HTTPS, no subdomain routing yet — see
  [architecture.md](architecture.md#3-multi-tenant-design-critical))
- DB: Postgres in a container on the same VPS (see
  [architecture.md](architecture.md#8-docker--deployment-improvements))
- Storage: Cloudflare R2 (planned) — actual MVP deploy uses self-hosted MinIO
  instead, see [deploy.md](deploy.md#image-uploads-minio) and "Known
  limitations"; not yet reconciled with this doc
- Email: Resend (transactional — signup, payment status, see
  [architecture.md](architecture.md#9-performance--scaling))

### Post-MVP

- DB: move to managed Postgres (Neon / Supabase / RDS) once a single-box DB
  becomes the bottleneck
- Subdomain routing (`:slug.biasmarket.com`) once themes/store count justify it

---

## 12. Roadmap

### MVP

- Auth (seller + buyer — see
  [product.md §4.8](product.md#48-buyer-authentication-public-storefront))
- Store creation
- Product CRUD
- Payment & delivery configuration (per store — see
  [product.md §4.4](product.md#44-payment-configuration-seller-panel) and
  [§4.5](product.md#45-delivery-methods-seller-panel))
- Order flow
- Payment proof upload
- Admin review
- Order expiration handling — auto-cancel unpaid `PENDING_PAYMENT` orders and
  release the stock hold (see
  [security-payments.md §9.2](security-payments.md#92-flow))
- i18n foundation — ES/EN UI strings, `User.locale`/`Store.locale` (see
  [i18n.md](i18n.md))

### v1

- Themes marketplace
- Subdomain support
- Analytics dashboard
- Multi-locale storefront content (bilingual same-store, see [i18n.md](i18n.md))

### v2

- Real payment integrations
- Advanced inventory management — low-stock alerts, restock workflows,
  multi-warehouse (basic per-variant stock and soft-hold already ship in MVP,
  see [product.md §4.2](product.md#42-product-management--crud-seller-panel) and
  [security-payments.md §9.2](security-payments.md#92-flow))
- Group order system (K-pop specific)

---

## 14. Risks

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
  [§9.2](security-payments.md#92-flow))

---

## 15. Final Notes

- Keep MVP extremely focused
- Do NOT overbuild payments
- Optimize for speed + UX
- Your edge = niche + workflow understanding
