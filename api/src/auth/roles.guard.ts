import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { AuthenticatedRequest } from './jwt-user.interface.js';
import { ROLES_KEY } from './roles.decorator.js';

// Must run after JwtAuthGuard, because it needs req.user to exist.
// Returning false makes Nest answer 403 Forbidden.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) {
      return false;
    }
    // Compare req.user.role against the roles the route requires
    return requiredRoles.includes(req.user.role);
  }
}
