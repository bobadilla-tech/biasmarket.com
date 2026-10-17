import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class UpdateWhatsAppTemplateDto {
  // `template` is seller-authored prose plus a full itemized order — capped
  // so a long message can't silently blow past practical wa.me/mobile
  // deep-link URL limits (see the plan doc).
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  template: string;
}
