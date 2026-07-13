# Architecture

Tech stack, module layout, database, and multi-tenant theming.

## 4. System Architecture

### 4.1 Tech Stack

- Backend: NestJS
- ORM: Prisma
- Database: PostgreSQL
- Containerization: Docker + Docker Compose
- Storage:

  - S3-compatible (Cloudflare R2 recommended)
- Auth:

  - JWT (access + refresh)

---

### 4.2 Docker Setup

```yaml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    depends_on:
      - db

  db:
    image: postgres:15
    restart: always
    environment:
      POSTGRES_USER: barri
      POSTGRES_PASSWORD: barri
      POSTGRES_DB: barristore
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

---

### 4.3 Modular Architecture (Feature Slice)

```
src/
  modules/
    auth/
    users/
    stores/
    products/
    orders/
    payments/
    uploads/
    themes/
```

Each module contains:

- controller
- service
- dto
- prisma mappings

---

## 5. Database Design (Core Models)

### User

- id
- email
- password_hash
- created_at

### Store

- id
- name
- slug
- owner_id
- theme_config (JSON)
- payment_instructions (TEXT)

### Product

- id
- store_id
- name
- description
- price
- metadata (JSON)

### Order

- id
- store_id
- customer_email
- status
- total_amount
- created_at

### OrderItem

- id
- order_id
- product_id
- quantity
- selected_variant

### PaymentProof

- id
- order_id
- image_url
- status
- reviewed_by
- reviewed_at

---

## 6. White-Label Architecture

### Approach: Theme Tokens + Config Injection

#### Theme Config (DB JSON)

```json
{
  "primaryColor": "#FF4D6D",
  "font": "Inter",
  "layout": "minimal"
}
```

### Rendering Strategy

- Storefront reads theme config
- Injects into:

  - CSS variables
  - Tailwind config (runtime mapping)

### Multi-tenant Routing

```
/store/:slug
```

OR

```
:slug.barri.store
```
