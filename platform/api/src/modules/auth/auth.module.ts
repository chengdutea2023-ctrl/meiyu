import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RegistrationsModule } from '../registrations/registrations.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PlatformAdminGuard } from './guards/platform-admin.guard';
import { SsoController } from './sso.controller';

@Module({
  imports: [JwtModule.register({}), RegistrationsModule],
  controllers: [AuthController, SsoController],
  providers: [AuthService, JwtAuthGuard, PlatformAdminGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, PlatformAdminGuard],
})
export class AuthModule {}
