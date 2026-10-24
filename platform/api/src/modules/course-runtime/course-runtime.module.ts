import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkItemsModule } from '../work-items/work-items.module';
import { CourseRuntimeController } from './course-runtime.controller';
import { CourseRuntimeService } from './course-runtime.service';
import { PreparationService } from './preparation.service';
import { PreparationController } from './preparation.controller';

@Module({
  imports: [AuthModule, PrismaModule, WorkItemsModule],
  controllers: [CourseRuntimeController, PreparationController],
  providers: [CourseRuntimeService, PreparationService],
})
export class CourseRuntimeModule {}
