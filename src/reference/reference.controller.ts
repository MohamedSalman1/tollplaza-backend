import { Controller, Get, HttpStatus } from '@nestjs/common';
import { CurrentUser } from '@app/entities/decorators/current-user.decorator';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { MONEY_VISIBLE_ROLES } from '@app/entities/constants/constants';
import { ReferenceService } from './reference.service';

@Controller({ path: 'reference', version: '1' })
export class ReferenceController {
  constructor(private readonly referenceService: ReferenceService) {}

  /**
   * GET /reference/vehicle-classes
   * Tag classes, the vehicle classes in each and their default tariff,
   * replacing the maps that were hard-coded in the dashboard. The default
   * tariff is only included for roles that can see money.
   */
  @Get('vehicle-classes')
  async vehicleClasses(@CurrentUser() user: JwtPayload) {
    return {
      statusCode: HttpStatus.OK,
      tag_classes: await this.referenceService.tagClasses(
        MONEY_VISIBLE_ROLES.includes(user.role),
      ),
    };
  }
}
