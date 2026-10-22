import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '@app/entities/decorators/current-user.decorator';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { CrossingsService } from './crossings.service';
import { ListCrossingsDto } from './dto/list-crossings.dto';
import { CrossingFacetsDto } from './dto/crossing-facets.dto';
import { CrossingDetailDto } from './dto/crossing-detail.dto';
import { CrossingUpdatesDto } from './dto/crossing-updates.dto';

@Controller({ path: 'crossings', version: '1' })
export class CrossingsController {
  constructor(private readonly crossingsService: CrossingsService) {}

  /**
   * GET /crossings
   * Filtered, sorted list with cursor pagination (follow next_cursor).
   */
  @Get()
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() listCrossingsDto: ListCrossingsDto,
  ) {
    const result = await this.crossingsService.list(user, listCrossingsDto);
    return {
      statusCode: HttpStatus.OK,
      ...result,
    };
  }

  /**
   * GET /crossings/facets?field=state,make
   * Column filter dropdown values with counts.
   */
  @Get('facets')
  async facets(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFacetsDto: CrossingFacetsDto,
  ) {
    const result = await this.crossingsService.facets(user, crossingFacetsDto);
    return {
      statusCode: HttpStatus.OK,
      ...result,
    };
  }

  /**
   * GET /crossings/updates?since=<cursor>
   * New crossings since the last call (fallback for /stream).
   */
  @Get('updates')
  async updates(
    @CurrentUser() user: JwtPayload,
    @Query() crossingUpdatesDto: CrossingUpdatesDto,
  ) {
    const result = await this.crossingsService.updates(
      user,
      crossingUpdatesDto,
    );
    return { statusCode: HttpStatus.OK, ...result };
  }

  /**
   * GET /crossings/export.csv
   * The filtered, sorted list (cursor and limit are ignored).
   */
  @Get('export.csv')
  exportCsv(
    @CurrentUser() user: JwtPayload,
    @Query() listCrossingsDto: ListCrossingsDto,
    @Res() res: Response,
  ) {
    return this.crossingsService.exportCsv(user, listCrossingsDto, res);
  }

  /**
   * GET /crossings/:id/adjacent
   * Drawer previous/next, with the table's filters, sort and dir.
   */
  @Get(':id/adjacent')
  async adjacent(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query() listCrossingsDto: ListCrossingsDto,
  ) {
    const result = await this.crossingsService.adjacent(
      user,
      id,
      listCrossingsDto,
    );
    return { statusCode: HttpStatus.OK, ...result };
  }

  /**
   * GET /crossings/:id
   * Detail drawer. Declared last so it doesn't catch the routes above.
   */
  @Get(':id')
  async detail(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query() crossingDetailDto: CrossingDetailDto,
  ) {
    const crossing = await this.crossingsService.detail(
      user,
      id,
      crossingDetailDto.tz,
    );
    return {
      statusCode: HttpStatus.OK,
      crossing,
    };
  }
}
