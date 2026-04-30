import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AppAuthController } from './app-auth.controller';
import { AppAuthService } from './app-auth.service';

@Module({
  imports: [PrismaModule],
  controllers: [AppAuthController],
  providers: [AppAuthService],
})
export class AppAuthModule {}
