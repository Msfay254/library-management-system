import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }
    // Never store the plain password: save only the bcrypt hash
    const passwordHash = await bcrypt.hash(dto.password, 10);
    // New accounts are always PATRON (the schema default). Librarians are created by staff.
    const user = await this.prisma.user.create({
      data: { email: dto.email, password: passwordHash },
      select: { id: true, email: true, role: true },
    });
    // Registering also signs the user in, so return a JWT like login does
    return { ...user, access_token: await this.signToken(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const passwordMatches = user
      ? await bcrypt.compare(dto.password, user.password)
      : false;
    if (!user || !passwordMatches) {
      // Same message for both cases, so attackers cannot tell which one failed
      throw new UnauthorizedException('Invalid email or password');
    }
    return { access_token: await this.signToken(user) };
  }

  private signToken(user: { id: number; email: string; role: Role }) {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }
}
