import { IsString } from "class-validator";
import { IsValidBuyerPhone } from "./is-valid-buyer-phone.js";

export class CorrectBuyerPhoneDto {
  // The right WhatsApp number of the buyer; stored in canonical E.164.
  @IsString()
  @IsValidBuyerPhone()
  customerPhone: string;
}
