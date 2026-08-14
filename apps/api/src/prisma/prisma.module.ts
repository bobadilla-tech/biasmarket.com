import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Global() // así no hay que importarlo en cada módulo (users, buyers, orders, etc.)
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
