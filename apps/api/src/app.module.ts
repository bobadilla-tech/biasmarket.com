import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { StorageModule } from './storage/storage.module.js';
import { MailerModule } from './mailer/mailer.module.js';
import { QueueModule } from './queue/queue.module.js';
import { AppController } from './app.controller.js';
import { StoresModule } from './modules/stores/stores.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { SellerAuthModule } from './auth/auth.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { DeliveryConfigModule } from './modules/delivery-config/delivery-config.module.js';
import { PickupPointsModule } from './modules/pickup-points/pickup-points.module.js';
import { PaymentConfigModule } from './modules/payment-config/payment-config.module.js';
import { ContactModule } from './modules/contact/contact.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { CollectionsModule } from './modules/collections/collections.module.js';
import { StoreSectionsModule } from './modules/store-sections/store-sections.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { StatsModule } from './modules/stats/stats.module.js';
import { CustomerAuthModule } from './modules/customer-auth/customer-auth.module.js';
import { RestockModule } from './modules/restock/restock.module.js';
import { WhatsappTemplatesModule } from './modules/whatsapp-templates/whatsapp-templates.module.js';
import { AddressesModule } from './modules/addresses/addresses.module.js';
import { MonitoringModule } from './modules/monitoring/monitoring.module.js';

@Module({
  imports: [
    StoresModule,
    ProductsModule,
    PrismaModule,
    StorageModule,
    MailerModule,
    QueueModule,
    UsersModule,
    HealthModule,
    SellerAuthModule,
    OrdersModule,
    DeliveryConfigModule,
    PickupPointsModule,
    PaymentConfigModule,
    ContactModule,
    CategoriesModule,
    CollectionsModule,
    StoreSectionsModule,
    NotificationsModule,
    StatsModule,
    CustomerAuthModule,
    RestockModule,
    WhatsappTemplatesModule,
    AddressesModule,
    MonitoringModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
