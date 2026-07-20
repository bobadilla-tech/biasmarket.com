import { IsIn } from 'class-validator';

export class ReviewPaymentDto {
  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';
}
