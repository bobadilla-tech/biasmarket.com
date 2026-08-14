import { PartialType } from '@nestjs/swagger';
import { CreateAddressDto } from './create-address.dto.js';

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
