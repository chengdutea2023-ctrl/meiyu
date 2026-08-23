import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('api/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: '检查 API、PostgreSQL 和 Redis' })
  async check() {
    const result = await this.healthService.check();
    if (result.status !== 'ok') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
