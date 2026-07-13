# Deployment, Roadmap & Risks

Where this ships, what ships when, and what could go wrong.

## 11. Deployment

### MVP Stack

- Host: Hetzner VPS — single box, docker compose (`web`, `api`, `db` images)
- Reverse proxy / TLS: Caddy (auto HTTPS, no subdomain routing yet — see
  [architecture.md](architecture.md#3-multi-tenant-design-critical))
- DB: Postgres in a container on the same VPS (see
  [architecture.md](architecture.md#8-docker--deployment-improvements))
- Storage: Cloudflare R2

### Post-MVP

- DB: move to managed Postgres (Neon / Supabase / RDS) once a single-box DB
  becomes the bottleneck
- Subdomain routing (`:slug.barri.store`) once themes/store count justify it

---

## 12. Roadmap

### MVP

- Auth
- Store creation
- Product CRUD
- Order flow
- Payment proof upload
- Admin review
- i18n foundation — ES/EN UI strings, `User.locale`/`Store.locale` (see
  [i18n.md](i18n.md))

### v1

- Themes marketplace
- Subdomain support
- Analytics dashboard
- Multi-locale storefront content (bilingual same-store, see
  [i18n.md](i18n.md))

### v2

- Real payment integrations
- Inventory tracking
- Group order system (K-pop specific)

---

## 14. Risks

- Fraud (fake payment screenshots)
- Charge disputes (manual systems)
- Scaling multi-tenant themes

Mitigation:

- Admin verification tools
- Audit logs
- Rate limiting

---

## 15. Final Notes

- Keep MVP extremely focused
- Do NOT overbuild payments
- Optimize for speed + UX
- Your edge = niche + workflow understanding
