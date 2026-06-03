import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CourseAssignmentsController } from './course-assignments.controller';
import { CoursewaresController } from './coursewares.controller';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CoursesController, CoursewaresController, CourseAssignmentsController],
  providers: [CoursesService],
})
export class CoursesModule {}
