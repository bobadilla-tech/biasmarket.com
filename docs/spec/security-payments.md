# Security, API Design & Payments

Validation rules, why REST over tRPC, and the manual payment flow.

## 7. Security & Validation (Critical)

### 7.1 Password Handling (Salt)

Use:

- bcrypt with salt rounds (>=10)

```ts
bcrypt.hash(password, saltRounds);
```

Never:

- Store raw passwords
- Use unsalted hashes

---

### 7.2 Input Validation

Use:

- class-validator (DTOs)
- Zod (optional for stricter schemas)

#### Example

```ts
email: string;
```

---

### 7.3 File Upload Validation

For proof-of-payment:

- Max size (e.g. 5MB)
- Allowed types:

  - image/jpeg
  - image/png
- Virus scan (optional future)

---

### 7.4 Abuse Prevention

Even without "public API", server actions = endpoints

Add:

- Rate limiting (IP-based)
- CSRF protection
- Input sanitization

---

## 8. Server Actions vs tRPC vs REST

### Recommendation: Stick with NestJS REST

#### Why NOT tRPC here:

- Tight coupling frontend/backend
- Harder scaling across services
- NestJS already structured

#### Server Actions:

- Good for Next.js frontend
- BUT:

  - Still exposed endpoints
  - Must validate input
  - Must enforce auth

### Best Setup:

- NestJS REST API
- Optional Next.js frontend using server actions as a thin layer

---

## 9. Payment Flow Design (Manual)

### Flow

1. Order created
2. Status: `PENDING_PAYMENT`
3. User uploads proof
4. Status: `PAYMENT_SUBMITTED`
5. Admin reviews:

   - Approve → `VERIFIED`
   - Reject → `REJECTED`

### Future Upgrade Path

- Stripe / MercadoPago integration
- Hybrid manual + automated

---

## 10. Storage Strategy

Use:

- Cloudflare R2 (cheap, scalable)

Store:

- Product images
- Payment proofs

Save only:

- URL in DB
