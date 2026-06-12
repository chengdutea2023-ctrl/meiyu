import { BadRequestException, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkItemStatus } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtUserPayload } from '../auth/types/jwt-payload';
import { WorkItemsService } from './work-items.service';

@ApiTags('work-items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('work-items')
export class WorkItemsController {
  constructor(private readonly workItemsService: WorkItemsService) {}

  @Get()
  @ApiOperation({ summary: '查看当前账号的待处理事项' })
  list(
    @CurrentUser() user: JwtUserPayload,
    @Query('status') status?: WorkItemStatus,
  ) {
    return this.workItemsService.listForUser(user, this.parseStatus(status));
  }

  @Get('summary')
  @ApiOperation({ summary: '查看当前账号的待处理数量' })
  summary(@CurrentUser() user: JwtUserPayload) {
    return this.workItemsService.summaryForUser(user);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: '标记待处理事项为已处理' })
  complete(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.workItemsService.completeForUser(user, id);
  }

  private parseStatus(status?: WorkItemStatus) {
    if (!status) {
      return WorkItemStatus.PENDING;
    }

    if (!Object.values(WorkItemStatus).includes(status)) {
      throw new BadRequestException('Invalid work item status');
    }

    return status;
  }
}
