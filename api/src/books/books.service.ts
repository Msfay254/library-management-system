import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { prismaErrorCode } from '../common/prisma-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateBookDto } from './dto/create-book.dto.js';
import { UpdateBookDto } from './dto/update-book.dto.js';

export interface FindAllBooksOptions {
  genreId?: number;
  search?: string;
  page: number;
  limit: number;
}

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ genreId, search, page, limit }: FindAllBooksOptions) {
    // Build the Prisma "where" clause from whichever filters were supplied
    const where: Prisma.BookWhereInput = {};
    if (genreId !== undefined) {
      where.genreId = genreId;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { author: { contains: search, mode: 'insensitive' } },
      ];
    }

    // skip/take implement pagination: page 1 skips 0 rows, page 2 skips "limit" rows, ...
    const [data, total] = await this.prisma.$transaction([
      this.prisma.book.findMany({
        where,
        include: { genre: true },
        orderBy: { title: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.book.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: { genre: true },
    });
    if (!book) {
      throw new NotFoundException(`Book ${id} not found`);
    }
    return book;
  }

  async create(dto: CreateBookDto) {
    try {
      return await this.prisma.book.create({
        data: {
          title: dto.title,
          author: dto.author,
          isbn: dto.isbn,
          description: dto.description ?? `${dto.title} by ${dto.author}.`,
          coverImage: dto.coverImage,
          totalCopies: dto.totalCopies,
          availableCopies: dto.totalCopies,
          genreId: dto.genreId,
        },
        include: { genre: true },
      });
    } catch (error) {
      throw this.translateError(error, dto.genreId);
    }
  }

  async update(id: number, dto: UpdateBookDto) {
    try {
      return await this.prisma.book.update({
        where: { id },
        data: {
          title: dto.title,
          author: dto.author,
          isbn: dto.isbn,
          description: dto.description,
          coverImage: dto.coverImage,
          totalCopies: dto.totalCopies,
          availableCopies: dto.availableCopies,
          genreId: dto.genreId,
        },
        include: { genre: true },
      });
    } catch (error) {
      throw this.translateError(error, dto.genreId, id);
    }
  }

  async remove(id: number) {
    try {
      return await this.prisma.book.delete({ where: { id } });
    } catch (error) {
      if (prismaErrorCode(error) === 'P2025') {
        throw new NotFoundException(`Book ${id} not found`);
      }
      throw error;
    }
  }

  // Turns database error codes into proper HTTP errors
  private translateError(error: unknown, genreId?: number, bookId?: number) {
    const code = prismaErrorCode(error);
    if (code === 'P2002') {
      return new ConflictException('A book with this ISBN already exists');
    }
    if (code === 'P2003') {
      return new BadRequestException(`Genre ${genreId} does not exist`);
    }
    if (code === 'P2025') {
      return new NotFoundException(`Book ${bookId} not found`);
    }
    return error;
  }
}
