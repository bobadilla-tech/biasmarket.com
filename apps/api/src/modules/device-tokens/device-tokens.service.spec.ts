import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceTokensService } from './device-tokens.service.js';

describe('DeviceTokensService', () => {
  const prisma = { deviceToken: { upsert: vi.fn(), deleteMany: vi.fn() } };
  let service: DeviceTokensService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DeviceTokensService(prisma as never);
  });

  it('registers a token to the authenticated buyer and transfers a reused token', async () => {
    prisma.deviceToken.upsert.mockResolvedValue({
      id: 'device-1',
      platform: 'ios',
    });
    await service.register(
      { buyerAccountId: 'buyer-1' },
      'ExponentPushToken[secret]',
      'ios',
    );
    expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
      where: { expoPushToken: 'ExponentPushToken[secret]' },
      create: {
        userId: null,
        buyerAccountId: 'buyer-1',
        expoPushToken: 'ExponentPushToken[secret]',
        platform: 'ios',
      },
      update: { userId: null, buyerAccountId: 'buyer-1', platform: 'ios' },
      select: { id: true, platform: true },
    });
  });

  it('only unregisters the authenticated owner token', async () => {
    prisma.deviceToken.deleteMany.mockResolvedValue({ count: 1 });
    await service.unregister(
      { userId: 'seller-1' },
      'ExponentPushToken[secret]',
    );
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'seller-1', expoPushToken: 'ExponentPushToken[secret]' },
    });
  });

  it('removes a token Expo has marked as unregistered', async () => {
    prisma.deviceToken.deleteMany.mockResolvedValue({ count: 1 });
    await service.removeInvalidToken('ExponentPushToken[secret]');
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { expoPushToken: 'ExponentPushToken[secret]' },
    });
  });
});
