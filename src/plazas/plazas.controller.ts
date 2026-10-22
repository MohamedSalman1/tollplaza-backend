import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@app/entities/decorators/current-user.decorator';
import { Roles } from '@app/entities/decorators/roles.decorator';
import { RolesGuard } from '@app/entities/guards/roles.guard';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import {
  MONEY_VISIBLE_ROLES,
  PRICING_EDIT_ROLES,
} from '@app/entities/constants/constants';
import { PricingService } from './pricing.service';
import { PlazaAccessService } from './plaza-access.service';
import { UpdatePricingDto } from './dto/update-pricing.dto';

@Controller({ path: 'plazas', version: '1' })
@UseGuards(RolesGuard)
export class PlazasController {
  constructor(
    private readonly pricingService: PricingService,
    private readonly plazaAccess: PlazaAccessService,
  ) {}

  /**
   * GET /plazas
   * Plazas the user can see, for the header plaza selector.
   */
  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    const plazas = await this.plazaAccess.listForUser(user);
    return { statusCode: HttpStatus.OK, plazas };
  }

  /**
   * GET /plazas/:id/pricing
   * The plaza's price per vehicle class. Only for roles that can see money
   * (the whole resource is prices).
   */
  @Get(':id/pricing')
  @Roles(...MONEY_VISIBLE_ROLES)
  async getPricing(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.pricingService.get(user, id);
    return {
      statusCode: HttpStatus.OK,
      ...result,
    };
  }

  /**
   * PUT /plazas/:id/pricing
   * Changes prices for future crossings only.
   */
  @Put(':id/pricing')
  @Roles(...PRICING_EDIT_ROLES)
  async updatePricing(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePricingDto: UpdatePricingDto,
  ) {
    const result = await this.pricingService.update(user, id, updatePricingDto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Pricing updated',
      ...result,
    };
  }
}
