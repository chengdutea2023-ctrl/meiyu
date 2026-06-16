import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { AddClassMemberDto } from './dto/add-class-member.dto';
import { AddOrganizationMemberDto } from './dto/add-organization-member.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: '管理员创建机构/学校' })
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '管理员查看机构/学校列表' })
  findMany() {
    return this.organizationsService.findMany();
  }

  @Get('classes')
  @ApiOperation({ summary: '管理员查看所有班级及班级成员' })
  findClasses() {
    return this.organizationsService.findClasses();
  }

  @Patch('classes/:classId')
  @ApiOperation({ summary: '管理员修改班级名称或编码' })
  updateClass(@Param('classId') classId: string, @Body() dto: UpdateClassDto) {
    return this.organizationsService.updateClass(classId, dto);
  }

  @Delete('classes/:classId')
  @ApiOperation({ summary: '管理员把班级移入回收站' })
  deleteClass(@Param('classId') classId: string) {
    return this.organizationsService.moveClassToRecycleBin(classId);
  }

  @Patch('classes/:classId/restore')
  @ApiOperation({ summary: '管理员从回收站恢复班级' })
  restoreClass(@Param('classId') classId: string) {
    return this.organizationsService.restoreClass(classId);
  }

  @Delete('classes/:classId/permanent')
  @ApiOperation({ summary: '管理员永久删除班级' })
  permanentlyDeleteClass(@Param('classId') classId: string) {
    return this.organizationsService.permanentlyDeleteClass(classId);
  }

  @Get(':id')
  @ApiOperation({ summary: '管理员查看机构/学校详情' })
  findOne(@Param('id') id: string) {
    return this.organizationsService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '管理员修改机构/学校信息' })
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.updateOrganization(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '管理员把机构/学校移入回收站' })
  delete(@Param('id') id: string) {
    return this.organizationsService.moveOrganizationToRecycleBin(id);
  }

  @Patch(':id/restore')
  @ApiOperation({ summary: '管理员从回收站恢复机构/学校' })
  restore(@Param('id') id: string) {
    return this.organizationsService.restoreOrganization(id);
  }

  @Delete(':id/permanent')
  @ApiOperation({ summary: '管理员永久删除机构/学校' })
  permanentlyDelete(@Param('id') id: string) {
    return this.organizationsService.permanentlyDeleteOrganization(id);
  }

  @Post(':id/classes')
  @ApiOperation({ summary: '管理员创建班级' })
  createClass(@Param('id') id: string, @Body() dto: CreateClassDto) {
    return this.organizationsService.createClass(id, dto);
  }

  @Post(':id/members')
  @ApiOperation({ summary: '管理员把用户加入机构/学校' })
  addMember(@Param('id') id: string, @Body() dto: AddOrganizationMemberDto) {
    return this.organizationsService.addOrganizationMember(id, dto);
  }

  @Post('classes/:classId/members')
  @ApiOperation({ summary: '管理员把用户加入班级' })
  addClassMember(
    @Param('classId') classId: string,
    @Body() dto: AddClassMemberDto,
  ) {
    return this.organizationsService.addClassMember(classId, dto);
  }

  @Delete('classes/:classId/members/:userId')
  @ApiOperation({ summary: '管理员把用户移出班级' })
  removeClassMember(
    @Param('classId') classId: string,
    @Param('userId') userId: string,
  ) {
    return this.organizationsService.removeClassMember(classId, userId);
  }
}
