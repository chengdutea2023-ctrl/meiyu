import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppAuthModule } from './modules/app-auth/app-auth.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AuthModule } from './modules/auth/auth.module';
import { CourseRuntimeModule } from './modules/course-runtime/course-runtime.module';
import { CoursesModule } from './modules/courses/courses.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PortalModule } from './modules/portal/portal.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RecycleBinModule } from './modules/recycle-bin/recycle-bin.module';
import { RegistrationsModule } from './modules/registrations/registrations.module';
import { UsersModule } from './modules/users/users.module';
import { WorkItemsModule } from './modules/work-items/work-items.module';

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
    CoursesModule,
    PortalModule,
    CourseRuntimeModule,
    RecycleBinModule,
    WorkItemsModule,
  ],
})
export class AppModule {}
