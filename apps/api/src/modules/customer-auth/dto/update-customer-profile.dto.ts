import { IsString, MinLength } from 'class-validator';

// name-only for now — email/phone changes need a verification step before
// they can be committed (see docs/plans/2026-08-02-buyer-accounts-phase12-plan.md),
// not implemented in this pass. Keep them out of the DTO entirely (rather
// than accepting and ignoring them) so `forbidNonWhitelisted` rejects any
// client that tries to send them, instead of silently no-op'ing.
export class UpdateCustomerProfileDto {
  @IsString()
  @MinLength(1)
  name: string;
}
