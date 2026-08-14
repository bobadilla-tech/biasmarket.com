import { ApiProperty } from '@nestjs/swagger';

export class IncidentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  monitorId: number;

  @ApiProperty()
  monitorName: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt: string | null;
}

export class IncidentListResponseDto {
  @ApiProperty({ type: [IncidentResponseDto] })
  incidents: IncidentResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
