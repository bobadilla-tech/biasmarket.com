import { IsIn } from 'class-validator';

export class AdvanceFulfillmentDto {
  @IsIn(['IN_TRANSIT', 'READY', 'COMPLETED'])
  status: 'IN_TRANSIT' | 'READY' | 'COMPLETED';
}
