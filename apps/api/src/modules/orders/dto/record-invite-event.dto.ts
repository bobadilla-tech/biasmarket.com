import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CLAIM_MOMENTS } from '../../customer-auth/claim-ticket.js';

export const INVITE_EVENT_TYPES = [
  'INVITE_SHOWN',
  'INVITE_CLICKED',
  'INVITE_DISMISSED',
] as const;

export class RecordInviteEventDto {
  @IsIn(INVITE_EVENT_TYPES)
  type: (typeof INVITE_EVENT_TYPES)[number];

  // Where on the page the invite was shown. A closed set: nothing free-form
  // (no phone, token or email) can reach the stored payload through here.
  @ApiPropertyOptional({ enum: CLAIM_MOMENTS })
  @IsOptional()
  @IsIn(CLAIM_MOMENTS)
  moment?: (typeof CLAIM_MOMENTS)[number];
}
