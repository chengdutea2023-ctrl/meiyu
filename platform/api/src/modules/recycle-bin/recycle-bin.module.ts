import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RecycleBinController } from './recycle-bin.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [RecycleBinController],
})
export class RecycleBinModule {}
