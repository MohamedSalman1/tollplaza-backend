import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { CurrentUser } from '@app/entities/decorators/current-user.decorator';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import { CrossingStatsService } from './crossing-stats.service';
import { CrossingAnalyticsService } from './crossing-analytics.service';
import {
  BreakdownDto,
  HourlyDto,
  MatrixDto,
  TimelineDto,
} from './dto/analytics.dto';

@Controller({ path: 'crossings/stats', version: '1' })
export class CrossingStatsController {
  constructor(
    private readonly crossingStatsService: CrossingStatsService,
    private readonly analyticsService: CrossingAnalyticsService,
  ) {}

  /**
   * GET /crossings/stats/summary
   * KPI strip, for the same filters as the crossings table.
   */
  @Get('summary')
  async summary(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFilterDto: CrossingFilterDto,
  ) {
    const result = await this.crossingStatsService.summary(
      user,
      crossingFilterDto,
    );
    return {
      statusCode: HttpStatus.OK,
      ...result,
    };
  }

  /**
   * GET /crossings/stats/overview
   * Analytics overview tiles.
   */
  @Get('overview')
  async overview(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFilterDto: CrossingFilterDto,
  ) {
    const result = await this.analyticsService.overview(
      user,
      crossingFilterDto,
    );
    return { statusCode: HttpStatus.OK, ...result };
  }

  /**
   * GET /crossings/stats/timeline?bucket=15m
   */
  @Get('timeline')
  async timeline(
    @CurrentUser() user: JwtPayload,
    @Query() timelineDto: TimelineDto,
  ) {
    const result = await this.analyticsService.timeline(user, timelineDto);
    return { statusCode: HttpStatus.OK, ...result };
  }

  /**
   * GET /crossings/stats/hourly?group_by=region
   */
  @Get('hourly')
  async hourly(@CurrentUser() user: JwtPayload, @Query() hourlyDto: HourlyDto) {
    const result = await this.analyticsService.hourly(user, hourlyDto);
    return { statusCode: HttpStatus.OK, ...result };
  }

  /**
   * GET /crossings/stats/breakdown?field=state&limit=10
   */
  @Get('breakdown')
  async breakdown(
    @CurrentUser() user: JwtPayload,
    @Query() breakdownDto: BreakdownDto,
  ) {
    const result = await this.analyticsService.breakdown(user, breakdownDto);
    return { statusCode: HttpStatus.OK, ...result };
  }

  /**
   * GET /crossings/stats/matrix?rows=make&cols=model
   */
  @Get('matrix')
  async matrix(@CurrentUser() user: JwtPayload, @Query() matrixDto: MatrixDto) {
    const result = await this.analyticsService.matrix(user, matrixDto);
    return { statusCode: HttpStatus.OK, ...result };
  }
}
