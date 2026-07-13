# Deployment, Roadmap & Risks

Where this ships, what ships when, and what could go wrong.

## 11. Deployment

### Recommended Stack

- Backend: Fly.io / Railway / VPS
- DB: Managed Postgres (Neon / Supabase / RDS)
- Storage: R2
- CDN: Cloudflare

---

## 12. Roadmap

### MVP

- Auth
- Store creation
- Product CRUD
- Order flow
- Payment proof upload
- Admin review

### v1

- Themes marketplace
- Subdomain support
- Analytics dashboard

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
