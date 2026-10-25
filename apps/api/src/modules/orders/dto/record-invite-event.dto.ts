import { IsIn } from 'class-validator';

export const INVITE_EVENT_TYPES = [
  'INVITE_SHOWN',
  'INVITE_CLICKED',
  'INVITE_DISMISSED',
] as const;

export class RecordInviteEventDto {
  @IsIn(INVITE_EVENT_TYPES)
  type: (typeof INVITE_EVENT_TYPES)[number];
}
