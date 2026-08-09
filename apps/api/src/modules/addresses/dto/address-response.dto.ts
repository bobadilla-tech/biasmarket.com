export class AddressResponseDto {
  id: string;
  customerId: string;
  label: string | null;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  reference: string | null;
  isDefault: boolean;
  createdAt: string;
}
