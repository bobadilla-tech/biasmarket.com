import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class PruneDeviceTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  @Matches(/^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/)
  expoPushToken!: string;
}
