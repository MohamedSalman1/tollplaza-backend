import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { CurrentUser } from '@app/entities/decorators/current-user.decorator';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import { PlazaAccessService } from '../plazas/plaza-access.service';
import { LanesService } from './lanes.service';

@Controller({ path: 'lanes', version: '1' })
export class LanesController {
  constructor(
    private readonly lanesService: LanesService,
    private readonly plazaAccess: PlazaAccessService,
  ) {}

  /**
   * GET /lanes/health?plaza_id=1
   * Lane status strip. The filters apply to crossings_in_range and
   * watchlist_hits; last crossing and last hour ignore them.
   */
  @Get('health')
  async health(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFilterDto: CrossingFilterDto,
  ) {
    const scope = await this.plazaAccess.resolve(
      user,
      crossingFilterDto.plaza_id,
      crossingFilterDto.tz,
    );
    const result = await this.lanesService.health(scope, crossingFilterDto);
    return { statusCode: HttpStatus.OK, ...result };
  }
}
