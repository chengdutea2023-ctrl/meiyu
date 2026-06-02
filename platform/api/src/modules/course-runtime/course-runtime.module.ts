import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CourseRuntimeController } from './course-runtime.controller';
import { CourseRuntimeService } from './course-runtime.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CourseRuntimeController],
  providers: [CourseRuntimeService],
})
export class CourseRuntimeModule {}
