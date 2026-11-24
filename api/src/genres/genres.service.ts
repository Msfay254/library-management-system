import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prismaErrorCode } from '../common/prisma-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateGenreDto } from './dto/create-genre.dto.js';
import { UpdateGenreDto } from './dto/update-genre.dto.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class GenresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateGenreDto) {
    try {
      return await this.prisma.genre.create({
        data: { name: dto.name, slug: dto.slug ?? slugify(dto.name) },
      });
    } catch (error) {
      if (prismaErrorCode(error) === 'P2002') {
        throw new ConflictException('A genre with this name or slug already exists');
      }
      throw error;
    }
  }

  findAll() {
    return this.prisma.genre.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: number) {
    const genre = await this.prisma.genre.findUnique({
      where: { id },
      include: { books: true },
    });
    if (!genre) {
      throw new NotFoundException(`Genre ${id} not found`);
    }
    return genre;
  }

  async update(id: number, dto: UpdateGenreDto) {
    try {
      return await this.prisma.genre.update({
        where: { id },
        data: { name: dto.name, slug: dto.slug },
      });
    } catch (error) {
      const code = prismaErrorCode(error);
      if (code === 'P2025') {
        throw new NotFoundException(`Genre ${id} not found`);
      }
      if (code === 'P2002') {
        throw new ConflictException('A genre with this name or slug already exists');
      }
      throw error;
    }
  }

  async remove(id: number) {
    try {
      return await this.prisma.genre.delete({ where: { id } });
    } catch (error) {
      const code = prismaErrorCode(error);
      if (code === 'P2025') {
        throw new NotFoundException(`Genre ${id} not found`);
      }
      if (code === 'P2003') {
        throw new ConflictException('Cannot delete a genre that still has books');
      }
      throw error;
    }
  }
}
