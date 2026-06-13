import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkItemsModule } from '../work-items/work-items.module';
import {
  CourseRuntimeController,
  CourseRuntimePublicController,
} from './course-runtime.controller';
import { CourseRuntimeService } from './course-runtime.service';

@Module({
  imports: [AuthModule, PrismaModule, WorkItemsModule],
  controllers: [CourseRuntimeController, CourseRuntimePublicController],
  providers: [CourseRuntimeService],
})
export class CourseRuntimeModule {}
