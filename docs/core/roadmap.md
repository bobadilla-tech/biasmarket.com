# Deployment, Roadmap & Risks

Where this ships, what ships when, and what could go wrong.

## 11. Deployment

### MVP Stack

- Host: Hetzner VPS — single box, docker compose (`web`, `api`, `db` images)
- Reverse proxy / TLS: Caddy (auto HTTPS, no subdomain routing yet — see
  [architecture.md](architecture.md#3-multi-tenant-design-critical))
- DB: Postgres in a container on the same VPS (see
  [architecture.md](architecture.md#8-docker--deployment-improvements))
- Storage: object storage — spec planned Cloudflare R2; the MVP deploy actually
  runs self-hosted MinIO (product images public, seller-recorded payment images
  in a private bucket), see [deploy.md](deploy.md#image-uploads-minio) and
  [security-payments.md §10](security-payments.md#10-storage-strategy)
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
  [product.md §5.8](product.md#58-buyer-authentication-public-storefront))
- Store creation
- Product CRUD
- Payment & delivery configuration (per store — see
  [product.md §5.4](product.md#54-payment-configuration-seller-panel) and
  [§5.5](product.md#55-delivery-methods-seller-panel))
- Order flow
- Payment recording & review — WhatsApp handoff + seller-recorded payments, no
  buyer-side proof upload (see
  [security-payments.md §9.2](security-payments.md#92-flow); in-app buyer proof
  upload is a possible future addition, §9.4)
- Admin review
- Order expiration handling — auto-cancel unpaid `PENDING_PAYMENT` orders and
  release the stock hold (see
  [security-payments.md §9.2](security-payments.md#92-flow))
- i18n foundation — ES/EN UI strings, `User.locale`/`Store.locale` (see
  [i18n.md](i18n.md))
- Cross-store discovery layer — featured stores, store directory, global product
  search (see
  [product.md §5.10](product.md#510-discovery-layer-public-cross-store))

### v1

- Themes marketplace
- Subdomain support
- Analytics dashboard
- Multi-locale storefront content (bilingual same-store, see [i18n.md](i18n.md))

### v2

- Real payment integrations
- Advanced inventory management — low-stock alerts, multi-warehouse (basic
  per-variant stock and soft-hold already ship in MVP, see
  [product.md §5.2](product.md#52-product-management--crud-seller-panel) and
  [security-payments.md §9.2](security-payments.md#92-flow); restock-interest
  workflow already shipped too — `apps/api/src/modules/restock/`, a buyer can
  ask to be notified when a sold-out product/variant restocks)
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
