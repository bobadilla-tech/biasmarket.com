import { Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { createAuth } from './auth.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    BetterAuthModule.forRootAsync({
      imports: [PrismaModule],
      useFactory: (prisma: PrismaService) => ({ auth: createAuth(prisma) }),
      inject: [PrismaService],
    }),
  ],
})
export class SellerAuthModule {}
