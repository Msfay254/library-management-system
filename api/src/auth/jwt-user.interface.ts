import type { Role } from '@prisma/client';

// What JwtStrategy.validate() attaches to the request as req.user
export interface JwtUser {
  id: number;
  email: string;
  role: Role;
}

export interface AuthenticatedRequest {
  user: JwtUser;
}
