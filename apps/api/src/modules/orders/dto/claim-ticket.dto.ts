import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CLAIM_MOMENTS } from '../../customer-auth/claim-ticket.js';

export class ClaimTicketDto {
  @ApiPropertyOptional({
    enum: CLAIM_MOMENTS,
    description: 'Where on the order page the buyer chose to save the order.',
  })
  @IsOptional()
  @IsIn(CLAIM_MOMENTS)
  moment?: (typeof CLAIM_MOMENTS)[number];
}
