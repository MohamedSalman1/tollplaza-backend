import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@app/entities/decorators/current-user.decorator';
import { Roles } from '@app/entities/decorators/roles.decorator';
import { RolesGuard } from '@app/entities/guards/roles.guard';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { WATCHLIST_EDIT_ROLES } from '@app/entities/constants/constants';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import { WatchlistService } from './watchlist.service';
import {
  CreateWatchlistDto,
  ListWatchlistDto,
  UpdateWatchlistDto,
} from './dto/watchlist.dto';

@Controller({ path: 'watchlist', version: '1' })
@UseGuards(RolesGuard)
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  /**
   * GET /watchlist?plaza_id=1
   * The plaza's entries plus all-plaza ones.
   */
  @Get()
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() listWatchlistDto: ListWatchlistDto,
  ) {
    const result = await this.watchlistService.list(user, listWatchlistDto);
    return { statusCode: HttpStatus.OK, ...result };
  }

  /**
   * GET /watchlist/summary
   * Entries by category and hits in the filtered range.
   */
  @Get('summary')
  async summary(
    @CurrentUser() user: JwtPayload,
    @Query() crossingFilterDto: CrossingFilterDto,
  ) {
    const result = await this.watchlistService.summary(user, crossingFilterDto);
    return { statusCode: HttpStatus.OK, ...result };
  }

  @Post()
  @Roles(...WATCHLIST_EDIT_ROLES)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() createWatchlistDto: CreateWatchlistDto,
  ) {
    const entry = await this.watchlistService.create(user, createWatchlistDto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Added to watchlist',
      entry,
    };
  }

  @Patch(':id')
  @Roles(...WATCHLIST_EDIT_ROLES)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateWatchlistDto: UpdateWatchlistDto,
  ) {
    const entry = await this.watchlistService.update(
      user,
      id,
      updateWatchlistDto,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Watchlist entry updated',
      entry,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(...WATCHLIST_EDIT_ROLES)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.watchlistService.remove(user, id);
    return { statusCode: HttpStatus.OK, message: 'Removed from watchlist' };
  }
}
