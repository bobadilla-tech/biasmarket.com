/**
 * @biasmarket/validation
 *
 * Shared zod schemas used by both the web app and the mobile app for buyer
 * flow validation: buyer authentication (login/register/address/change-password/
 * edit-contact/forgot-password), coupon redemption, and the public storefront
 * contact form. These were lifted from apps/web feature `schemas/` dirs so mobile
 * can share the exact same validation objects; apps/web re-exports them through
 * this package (see apps/web/features/customer-auth/index.ts, coupons/index.ts,
 * and contact/index.ts).
 */

export {
  type AddressInput,
  addressSchema,
  type CustomerChangePasswordInput,
  customerChangePasswordSchema,
  type CustomerLoginInput,
  customerLoginSchema,
  type CustomerRegisterInput,
  customerRegisterSchema,
  type EditContactInput,
  editContactSchema,
  type ForgotPasswordInput,
  forgotPasswordSchema,
} from "./buyer-auth/index.js";

export {
  redeemCouponSchema,
  type RedeemCouponValues,
} from "./coupons/index.js";

export {
  type InquirySubmissionInput,
  inquirySubmissionSchema,
} from "./contact/index.js";
