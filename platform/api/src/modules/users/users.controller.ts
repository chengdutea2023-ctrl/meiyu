import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { CreateUserDto } from './dto/create-user.dto';
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
}
