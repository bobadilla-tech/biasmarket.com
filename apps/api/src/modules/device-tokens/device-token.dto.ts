import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class DeviceTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  @Matches(/^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/)
  expoPushToken!: string;

  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';
}
