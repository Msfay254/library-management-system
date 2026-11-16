import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
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
    return this.prisma.user.create({
      data: { email: dto.email, password: passwordHash },
      select: { id: true, email: true, role: true },
    });
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
    const payload = { sub: user.id, email: user.email, role: user.role };
    return { access_token: await this.jwtService.signAsync(payload) };
  }
}
