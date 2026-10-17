import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

// Kuma's own status codes (extra/util-common.js in the Kuma source) — only
// DOWN/UP matter to recordEvent(), PENDING/MAINTENANCE fall through as a
// no-op resolve check.
export const KUMA_STATUS_DOWN = 0;
export const KUMA_STATUS_UP = 1;

// Mirrors Kuma's generic Webhook notification payload shape. Every field the
// handler doesn't read is @IsOptional() to minimize breakage risk against the
// global forbidNonWhitelisted:true pipe if Kuma's payload gains fields in a
// future version — verified against a real Kuma test-webhook fire at
// implementation time.
export class KumaHeartbeatDto {
  @IsInt()
  monitorID: number;

  @IsInt()
  status: number;

  @IsBoolean()
  important: boolean;

  @IsOptional()
  @IsString()
  time?: string;

  @IsOptional()
  @IsString()
  msg?: string;
}

export class KumaMonitorDto {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsString()
  name: string;
}

export class KumaWebhookDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => KumaHeartbeatDto)
  heartbeat: KumaHeartbeatDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => KumaMonitorDto)
  monitor: KumaMonitorDto;

  @IsOptional()
  @IsString()
  msg?: string;
}
