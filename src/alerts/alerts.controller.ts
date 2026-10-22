import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '@app/entities/decorators/current-user.decorator';
import { Roles } from '@app/entities/decorators/roles.decorator';
import { RolesGuard } from '@app/entities/guards/roles.guard';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { ALERT_REVIEW_ROLES } from '@app/entities/constants/constants';
import { AlertsService } from './alerts.service';
import { AlertFilterDto } from './dto/alert-filter.dto';
import { ListAlertsDto } from './dto/list-alerts.dto';
import { ReviewAlertsDto } from './dto/review-alerts.dto';

@Controller({ path: 'alerts', version: '1' })
@UseGuards(RolesGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  /**
   * GET /alerts
   * Most severe first, then newest. Default status=open.
   */
  @Get()
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() listAlertsDto: ListAlertsDto,
  ) {
    const result = await this.alertsService.list(user, listAlertsDto);
    return {
      statusCode: HttpStatus.OK,
      ...result,
    };
  }

  /**
   * GET /alerts/summary
   * KPIs, badge and side panels for the same filters.
   */
  @Get('summary')
  async summary(
    @CurrentUser() user: JwtPayload,
    @Query() alertFilterDto: AlertFilterDto,
  ) {
    const result = await this.alertsService.summary(user, alertFilterDto);
    return {
      statusCode: HttpStatus.OK,
      ...result,
    };
  }

  /**
   * GET /alerts/export.csv
   */
  @Get('export.csv')
  async exportCsv(
    @CurrentUser() user: JwtPayload,
    @Query() alertFilterDto: AlertFilterDto,
    @Res() res: Response,
  ) {
    await this.alertsService.exportCsv(user, alertFilterDto, res);
  }

  /**
   * POST /alerts/review
   * Marks alerts reviewed (or re-opens them) for every operator.
   */
  @Post('review')
  @HttpCode(HttpStatus.OK)
  @Roles(...ALERT_REVIEW_ROLES)
  async review(
    @CurrentUser() user: JwtPayload,
    @Body() reviewAlertsDto: ReviewAlertsDto,
  ) {
    const result = await this.alertsService.review(user, reviewAlertsDto);
    return {
      statusCode: HttpStatus.OK,
      message: reviewAlertsDto.reviewed
        ? 'Alerts marked reviewed'
        : 'Alerts re-opened',
      ...result,
    };
  }
}
