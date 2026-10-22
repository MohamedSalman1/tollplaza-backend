import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '@app/entities/decorators/current-user.decorator';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import { ReportsService } from './reports.service';
import { OverloadReportDto } from './dto/overload-report.dto';

/**
 * Every report takes the shared crossing filters and has a CSV export at
 * /reports/<name>/export.csv.
 */
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /reports/summary
   */
  @Get('summary')
  async summary(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFilterDto: CrossingFilterDto,
  ) {
    const result = await this.reportsService.summary(user, crossingFilterDto);
    return { statusCode: HttpStatus.OK, ...result };
  }

  @Get('summary/export.csv')
  exportSummary(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFilterDto: CrossingFilterDto,
    @Res() res: Response,
  ) {
    return this.reportsService.exportSummary(user, crossingFilterDto, res);
  }

  /**
   * GET /reports/daily
   */
  @Get('daily')
  async daily(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFilterDto: CrossingFilterDto,
  ) {
    const result = await this.reportsService.daily(user, crossingFilterDto);
    return { statusCode: HttpStatus.OK, ...result };
  }

  @Get('daily/export.csv')
  exportDaily(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFilterDto: CrossingFilterDto,
    @Res() res: Response,
  ) {
    return this.reportsService.exportDaily(user, crossingFilterDto, res);
  }

  /**
   * GET /reports/tag-classes
   */
  @Get('tag-classes')
  async tagClasses(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFilterDto: CrossingFilterDto,
  ) {
    const result = await this.reportsService.tagClasses(
      user,
      crossingFilterDto,
    );
    return { statusCode: HttpStatus.OK, ...result };
  }

  @Get('tag-classes/export.csv')
  exportTagClasses(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFilterDto: CrossingFilterDto,
    @Res() res: Response,
  ) {
    return this.reportsService.exportTagClasses(user, crossingFilterDto, res);
  }

  /**
   * GET /reports/exempt
   */
  @Get('exempt')
  async exempt(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFilterDto: CrossingFilterDto,
  ) {
    const result = await this.reportsService.exempt(user, crossingFilterDto);
    return { statusCode: HttpStatus.OK, ...result };
  }

  @Get('exempt/export.csv')
  exportExempt(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFilterDto: CrossingFilterDto,
    @Res() res: Response,
  ) {
    return this.reportsService.exportExempt(user, crossingFilterDto, res);
  }

  /**
   * GET /reports/overload
   */
  @Get('overload')
  async overload(
    @CurrentUser() user: JwtPayload,
    @Query() overloadReportDto: OverloadReportDto,
  ) {
    const result = await this.reportsService.overload(user, overloadReportDto);
    return { statusCode: HttpStatus.OK, ...result };
  }

  @Get('overload/export.csv')
  exportOverload(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFilterDto: CrossingFilterDto,
    @Res() res: Response,
  ) {
    return this.reportsService.exportOverload(user, crossingFilterDto, res);
  }
}
