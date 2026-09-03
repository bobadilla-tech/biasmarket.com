// @biasmarket/validation — shared zod schemas for web + mobile.

export { customerLoginSchema } from "./buyer-auth/login.schema.js";
export type { CustomerLoginInput } from "./buyer-auth/login.schema.js";
export { customerRegisterSchema } from "./buyer-auth/register.schema.js";
export type { CustomerRegisterInput } from "./buyer-auth/register.schema.js";
export { addressSchema } from "./buyer-auth/address.schema.js";
export type { AddressInput } from "./buyer-auth/address.schema.js";
export { customerChangePasswordSchema } from "./buyer-auth/change-password.schema.js";
export type { CustomerChangePasswordInput } from "./buyer-auth/change-password.schema.js";
export { editContactSchema } from "./buyer-auth/edit-contact.schema.js";
export type { EditContactInput } from "./buyer-auth/edit-contact.schema.js";
export { forgotPasswordSchema } from "./buyer-auth/forgot-password.schema.js";
export type { ForgotPasswordInput } from "./buyer-auth/forgot-password.schema.js";

export { redeemCouponSchema } from "./coupons/redeem-coupon.schema.js";
export type { RedeemCouponValues } from "./coupons/redeem-coupon.schema.js";

export { inquirySubmissionSchema } from "./contact/inquiry-submission.schema.js";
export type { InquirySubmissionInput } from "./contact/inquiry-submission.schema.js";
