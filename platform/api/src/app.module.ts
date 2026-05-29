import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppAuthModule } from './modules/app-auth/app-auth.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RegistrationsModule } from './modules/registrations/registrations.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    JwtModule.register({}),
    PrismaModule,
    AppAuthModule,
    AuthModule,
    RegistrationsModule,
    UsersModule,
    ApplicationsModule,
    OrganizationsModule,
  ],
})
export class AppModule {}
