import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkItemsController } from './work-items.controller';
import { WorkItemsService } from './work-items.service';

@Module({
  imports: [JwtModule.register({}), PrismaModule],
  controllers: [WorkItemsController],
  providers: [WorkItemsService, JwtAuthGuard],
  exports: [WorkItemsService],
})
export class WorkItemsModule {}
