import { ApiProperty } from '@nestjs/swagger';

export class InquiryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, nullable: true })
  company: string | null;

  @ApiProperty({ type: String, nullable: true })
  inquiryType: string | null;

  @ApiProperty()
  message: string;

  @ApiProperty({ enum: ['NEW', 'REVIEWED', 'ARCHIVED'] })
  status: 'NEW' | 'REVIEWED' | 'ARCHIVED';

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}
