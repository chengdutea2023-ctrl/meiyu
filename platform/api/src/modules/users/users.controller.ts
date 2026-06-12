import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { ImportStudentsDto } from './dto/import-students.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateUserApprovalDto } from './dto/update-user-approval.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: '管理员创建用户' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '管理员查看用户列表' })
  findMany() {
    return this.usersService.findMany();
  }

  @Post('import-students')
  @ApiOperation({ summary: '管理员批量导入学生并加入班级' })
  importStudents(@Body() dto: ImportStudentsDto) {
    return this.usersService.importStudents(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '管理员查看用户详情' })
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '管理员启用或禁用用户' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.usersService.updateStatus(id, dto.status);
  }

  @Patch(':id/approval')
  @ApiOperation({ summary: '管理员审核教师或调整用户审核状态' })
  updateApproval(@Param('id') id: string, @Body() dto: UpdateUserApprovalDto) {
    return this.usersService.updateApproval(id, dto.approvalStatus);
  }

  @Patch(':id/password')
  @ApiOperation({ summary: '管理员重置老师或学生密码' })
  resetPassword(@Param('id') id: string, @Body() dto: ResetUserPasswordDto) {
    return this.usersService.resetPassword(id, dto.password);
  }

  @Delete(':id')
  @ApiOperation({ summary: '管理员将学生或教师移入回收站' })
  moveToRecycleBin(@Param('id') id: string) {
    return this.usersService.moveToRecycleBin(id);
  }

  @Patch(':id/restore')
  @ApiOperation({ summary: '管理员从回收站恢复学生或教师' })
  restore(@Param('id') id: string) {
    return this.usersService.restore(id);
  }

  @Delete(':id/permanent')
  @ApiOperation({ summary: '管理员永久删除回收站中的学生或教师' })
  permanentlyDelete(@Param('id') id: string) {
    return this.usersService.permanentlyDelete(id);
  }
}
