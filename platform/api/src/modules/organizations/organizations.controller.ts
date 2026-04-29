import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { AddClassMemberDto } from './dto/add-class-member.dto';
import { AddOrganizationMemberDto } from './dto/add-organization-member.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
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

  @Get(':id')
  @ApiOperation({ summary: '管理员查看机构/学校详情' })
  findOne(@Param('id') id: string) {
    return this.organizationsService.findById(id);
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
}

