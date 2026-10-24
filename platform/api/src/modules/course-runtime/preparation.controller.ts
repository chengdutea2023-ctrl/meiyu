import { Body, Controller, ForbiddenException, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtUserPayload } from '../auth/types/jwt-payload';
import { PreparationService } from './preparation.service';
class PreparationLaunchDto { @IsString() assignmentId!: string; @IsString() coursewareId!: string; }
class PreparationVerifyDto { @IsString() preparationToken!: string; }
@Controller('course-runtime/preparation')
export class PreparationController {
  constructor(private readonly preparation: PreparationService) {}
  @Get('options') @UseGuards(JwtAuthGuard)
  options(@CurrentUser() user: JwtUserPayload, @Query('assignmentId') id: string) {
    if (user.readOnlyPreview) return { coursewares: [] };
    return this.preparation.options(user.sub, id);
  }
  @Post('launch') @UseGuards(JwtAuthGuard)
  launch(@CurrentUser() user: JwtUserPayload, @Body() dto: PreparationLaunchDto) {
    if (user.readOnlyPreview) throw new ForbiddenException('只读预览不能进入资料准备');
    return this.preparation.launch(user.sub, dto.assignmentId, dto.coursewareId);
  }
  @Post('verify') verify(@Body() dto: PreparationVerifyDto) { return this.preparation.verify(dto.preparationToken); }
}
