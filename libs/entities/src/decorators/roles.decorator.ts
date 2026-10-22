import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../constants/constants';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to these roles. Needs `@UseGuards(RolesGuard)`.
 */
export const Roles = (...roles: readonly UserRole[]) =>
  SetMetadata(ROLES_KEY, roles);
