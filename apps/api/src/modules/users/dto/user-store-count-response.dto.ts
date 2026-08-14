import { ApiProperty } from '@nestjs/swagger';

export class UserStoreCountResponseDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  storeCount: number;
}
