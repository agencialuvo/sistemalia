import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { MediaModule } from './modules/media/media.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { SunatModule } from './modules/sunat/sunat.module';
import { ServicesModule } from './modules/services/services.module';
import { StaffModule } from './modules/staff/staff.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UploadModule } from './modules/upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    SunatModule,
    UploadModule,
    TenantModule,
    ServicesModule,
    StaffModule,
    MediaModule,
    PaymentMethodsModule,
  ],
  providers: [
    // Global so tenant isolation is opt-out, not opt-in: any route added later
    // that reads `x-tenant-id` gets the membership check for free instead of
    // having to remember to wire it up. Requests without the header pass
    // through untouched.
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
