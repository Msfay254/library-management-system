# Library Management System

> **Reviewing this repository?** The NestJS source (genres, books, auth, roles, validation) is in `api/src`. The full source of every required file is also reproduced at the end of this README, under "Source of the required files".

NestJS + Prisma + PostgreSQL backend for a library's book catalog. This
repository contains the data layer: the schema, the migration, a seed script,
and the NestJS service that connects to the database.

## Where things are

| File | Purpose |
|---|---|
| `api/prisma/schema.prisma` | `Role` enum, `User`, `Genre`, `Book` (with a `genreId` foreign key and `@relation`), and the optional `Review` model |
| `api/prisma/migrations/` | The SQL migration applied to the hosted PostgreSQL database |
| `api/prisma/seed.ts` | Inserts 4 genres and 16 books spread across them |
| `api/src/prisma/prisma.service.ts` | `PrismaService` extends `PrismaClient`, implements `OnModuleInit`, and calls `this.$connect()` |
| `api/src/prisma/prisma.module.ts` | Global module that exports `PrismaService` |
| `api/.env.example` | `DATABASE_URL` placeholder (no real credentials) |

## Step-by-Step Solution

### 1. Write the Prisma schema

The schema is in `api/prisma/schema.prisma`:

~~~prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  PATRON
  LIBRARIAN
}

model User {
  id       Int      @id @default(autoincrement())
  email    String   @unique
  password String
  role     Role     @default(PATRON)
  reviews  Review[]
}

model Genre {
  id    Int    @id @default(autoincrement())
  name  String @unique
  slug  String @unique
  books Book[]
}

model Book {
  id              Int      @id @default(autoincrement())
  title           String
  author          String
  isbn            String   @unique
  description     String
  coverImage      String?
  totalCopies     Int      @default(1)
  availableCopies Int      @default(1)
  genreId         Int
  genre           Genre    @relation(fields: [genreId], references: [id])
  createdAt       DateTime @default(now())
  reviews         Review[]
}

model Review {
  id        Int      @id @default(autoincrement())
  rating    Int
  comment   String?
  bookId    Int
  userId    Int
  book      Book     @relation(fields: [bookId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())

  @@unique([bookId, userId])
}
~~~

### 2. Run the migration

~~~bash
cd api
cp .env.example .env     # then put your real DATABASE_URL in .env
npm install
npx prisma migrate dev --name init
~~~

This creates the SQL in `api/prisma/migrations/` and applies it to the
hosted PostgreSQL database (Neon).

### 3. Build the PrismaService

`api/src/prisma/prisma.service.ts`:

~~~ts
import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
~~~

`PrismaModule` is registered in `app.module.ts`, so the connection opens
when the application starts.

### 4. Write the seed script

`api/prisma/seed.ts` inserts **4 genres** (Fantasy, Science Fiction, Mystery,
Biography) and **16 books**, four in each genre. Each book is linked to its
genre through `genreId`. The script clears old rows first, so it can be
re-run safely.

### 5. Run and verify the seed

~~~bash
npx prisma db seed
npx prisma studio    # confirm the books and genres appear
~~~

The seed prints `Seed complete: 4 genres, 16 books`.

### 6. Start the API

~~~bash
npm run start:dev
~~~

## Schema Decisions

### Why Book references Genre instead of embedding it

A `Book` stores a `genreId` foreign key rather than embedding the genre
name directly, because many books share one genre and genres are managed
independently (renaming a genre should not require updating every book).

- **No duplication:** "Science Fiction" is stored once, in the `Genre`
  table. Renaming it is a single update.
- **Consistency:** each book points to a real `Genre` row, so the database
  rejects genres that do not exist and prevents spelling variants such as
  "Sci-Fi" vs "Science Fiction".
- **Easy queries:** "all books in a genre" and "how many books per genre"
  are simple lookups on the `genreId` column.
- **Independent entities:** a genre can exist before it has any books
  (a one-to-many relationship).

### Other decisions

- `User.role` uses the `Role` enum (`PATRON`, `LIBRARIAN`), so PostgreSQL and
  TypeScript both reject any value other than those two.
- `User.email`, `Genre.name`, `Genre.slug`, and `Book.isbn` are unique to
  prevent duplicates.
- `Book` tracks `totalCopies` and `availableCopies` for lending later on.
- `Review` links a `Book` and a `User`; `@@unique([bookId, userId])` allows
  one review per user per book.
- `DATABASE_URL` lives in `.env` (git-ignored); `.env.example` shows the
  format with no real credentials.

### Modeling in Prisma vs. a document database

Modeling in Prisma felt different from how I would approach a document
database, where I could embed a book's genre (and later its reviews)
directly inside the book document and save it right away. In Prisma I could
not add a book until its `Genre` existed as its own table, because
`Book.genreId` has to point to a real row. Changing the schema also meant
writing a migration and applying it to the database, instead of just saving
a document with a different shape. In return, the generated Prisma Client
gave me typed methods for every model, so mistakes showed up as errors in
my editor rather than at runtime.

The part that stretched me most was the setup. Getting to a working data
layer took more steps than I expected: configuring Prisma, matching the
Prisma CLI and client versions, and fixing a mismatch where the CLI had moved
to a newer major version than the client. It was slower up front, but I now
understand how the pieces fit together, and the strict structure is what
makes the relationships and data integrity explicit.

## Book API, Auth & Authorization

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign and verify login tokens |

Copy `api/.env.example` to `api/.env` and fill in real values. The real `.env` is git-ignored.

### Endpoints

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Create a PATRON account (password hashed with bcrypt); returns the user and an `access_token` |
| POST | `/auth/login` | Public, limited to 5 per minute | Returns `{ "access_token": "..." }` |
| GET | `/users/profile` | Logged in | The authenticated user, read from `req.user` |
| GET | `/genres`, `/genres/:id` | Public | List or read genres |
| POST, PATCH, DELETE | `/genres`, `/genres/:id` | LIBRARIAN | Create, update, delete a genre |
| GET | `/books` | Public | List books with filters and pagination |
| GET | `/books/:id` | Public | Read one book |
| POST, PATCH, DELETE | `/books`, `/books/:id` | LIBRARIAN | Create, update, delete a book |

`GET /books` query parameters: `genreId` (filter), `search` (title or author, case-insensitive),
`page` (default 1) and `limit` (default 10, max 100). The response is
`{ "data": [...], "meta": { "total", "page", "limit", "totalPages" } }`.

### Auth and roles

- Send the token as `Authorization: Bearer <access_token>`.
- `JwtAuthGuard` checks the token (401 if missing or invalid).
- `RolesGuard` with `@Roles('LIBRARIAN')` checks `req.user.role` (403 if not allowed).
- Registration always creates a PATRON. The seed creates a demo librarian
  (`librarian@example.com` / `Librarian123!`) and a demo patron
  (`patron@example.com` / `Patron123!`). These are demo credentials for local development only.
- `ValidationPipe({ whitelist: true })` validates every request body and strips unknown fields.

### Postman

Import `docs/postman_collection.json` into Postman and run the requests from the top.

## Required files (direct links)

Each link opens the raw source of the file on the `main` branch.

| File | Link |
|---|---|
| `api/prisma/schema.prisma` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/prisma/schema.prisma) |
| `api/prisma/seed.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/prisma/seed.ts) |
| `api/src/prisma/prisma.service.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/prisma/prisma.service.ts) |
| `api/.env.example` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/.env.example) |
| `api/src/genres/genres.controller.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/genres/genres.controller.ts) |
| `api/src/genres/genres.service.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/genres/genres.service.ts) |
| `api/src/genres/genres.module.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/genres/genres.module.ts) |
| `api/src/books/dto/create-book.dto.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/books/dto/create-book.dto.ts) |
| `api/src/books/books.controller.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/books/books.controller.ts) |
| `api/src/books/books.service.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/books/books.service.ts) |
| `api/src/auth/auth.controller.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/auth/auth.controller.ts) |
| `api/src/auth/auth.service.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/auth/auth.service.ts) |
| `api/src/auth/auth.module.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/auth/auth.module.ts) |
| `api/src/auth/jwt.strategy.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/auth/jwt.strategy.ts) |
| `api/src/auth/jwt-auth.guard.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/auth/jwt-auth.guard.ts) |
| `api/src/auth/roles.decorator.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/auth/roles.decorator.ts) |
| `api/src/auth/roles.guard.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/auth/roles.guard.ts) |
| `api/src/main.ts` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/api/src/main.ts) |
| `docs/postman_collection.json` | [view](https://raw.githubusercontent.com/Msfay254/library-management-system/main/docs/postman_collection.json) |

## Source of the required files

The full source of each required file is reproduced below so it can be read from this page. The same files exist at these paths in the repository.

### `api/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  PATRON
  LIBRARIAN
}

model User {
  id       Int      @id @default(autoincrement())
  email    String   @unique
  password String
  role     Role     @default(PATRON)
  reviews  Review[]
}

model Genre {
  id    Int    @id @default(autoincrement())
  name  String @unique
  slug  String @unique
  books Book[]
}

model Book {
  id              Int      @id @default(autoincrement())
  title           String
  author          String
  isbn            String   @unique
  description     String
  coverImage      String?
  totalCopies     Int      @default(1)
  availableCopies Int      @default(1)
  genreId         Int
  genre           Genre    @relation(fields: [genreId], references: [id])
  createdAt       DateTime @default(now())
  reviews         Review[]
}

// Stretch goal: a Book can have many Reviews, written by Users
model Review {
  id        Int      @id @default(autoincrement())
  rating    Int
  comment   String?
  bookId    Int
  userId    Int
  book      Book     @relation(fields: [bookId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())

  @@unique([bookId, userId])
}
```

### `api/prisma/seed.ts`

```ts
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Clear old catalog data (children first, then parents) so the seed can be re-run safely
  await prisma.review.deleteMany();
  await prisma.book.deleteMany();
  await prisma.genre.deleteMany();

  // 4 genres
  const genreNames = ["Fantasy", "Science Fiction", "Mystery", "Biography"];
  const genres = await Promise.all(
    genreNames.map((name) =>
      prisma.genre.create({
        data: { name, slug: name.toLowerCase().replace(/\s+/g, "-") },
      }),
    ),
  );

  // 16 books spread across the 4 genres (4 each)
  const sampleBooks = [
    { title: "The Hobbit", author: "J.R.R. Tolkien", genre: "Fantasy" },
    { title: "A Wizard of Earthsea", author: "Ursula K. Le Guin", genre: "Fantasy" },
    { title: "The Name of the Wind", author: "Patrick Rothfuss", genre: "Fantasy" },
    { title: "Mistborn", author: "Brandon Sanderson", genre: "Fantasy" },
    { title: "Dune", author: "Frank Herbert", genre: "Science Fiction" },
    { title: "Neuromancer", author: "William Gibson", genre: "Science Fiction" },
    { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", genre: "Science Fiction" },
    { title: "Foundation", author: "Isaac Asimov", genre: "Science Fiction" },
    { title: "The Big Sleep", author: "Raymond Chandler", genre: "Mystery" },
    { title: "And Then There Were None", author: "Agatha Christie", genre: "Mystery" },
    { title: "The Hound of the Baskervilles", author: "Arthur Conan Doyle", genre: "Mystery" },
    { title: "Gone Girl", author: "Gillian Flynn", genre: "Mystery" },
    { title: "Educated", author: "Tara Westover", genre: "Biography" },
    { title: "The Diary of a Young Girl", author: "Anne Frank", genre: "Biography" },
    { title: "Long Walk to Freedom", author: "Nelson Mandela", genre: "Biography" },
    { title: "Steve Jobs", author: "Walter Isaacson", genre: "Biography" },
  ];

  let isbnNumber = 1;
  for (const book of sampleBooks) {
    const genre = genres.find((g) => g.name === book.genre);
    if (!genre) {
      throw new Error(`Unknown genre: ${book.genre}`);
    }
    await prisma.book.create({
      data: {
        title: book.title,
        author: book.author,
        // Sample ISBNs (not real), numbered so they are always unique
        isbn: `978000000${String(isbnNumber++).padStart(4, "0")}`,
        description: `${book.title} by ${book.author}.`,
        totalCopies: 3,
        availableCopies: 3,
        genreId: genre.id,
      },
    });
  }

  // Demo accounts. Passwords are stored as bcrypt hashes, never as plain text.
  const librarianHash = await bcrypt.hash("Librarian123!", 10);
  await prisma.user.upsert({
    where: { email: "librarian@example.com" },
    update: { password: librarianHash, role: "LIBRARIAN" },
    create: { email: "librarian@example.com", password: librarianHash, role: "LIBRARIAN" },
  });
  const patronHash = await bcrypt.hash("Patron123!", 10);
  await prisma.user.upsert({
    where: { email: "patron@example.com" },
    update: { password: patronHash, role: "PATRON" },
    create: { email: "patron@example.com", password: patronHash, role: "PATRON" },
  });

  const genreCount = await prisma.genre.count();
  const bookCount = await prisma.book.count();
  console.log(`Seed complete: ${genreCount} genres, ${bookCount} books, 2 demo users`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

### `api/src/prisma/prisma.service.ts`

```ts
import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

### `api/.env.example`

```text
# Copy this file to .env and replace the placeholder with your real connection string.
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE_NAME"

# Secret used to sign login tokens. Use a long random string.
JWT_SECRET="replace-with-a-long-random-string"
```

### `api/src/genres/genres.controller.ts`

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateGenreDto } from './dto/create-genre.dto.js';
import { UpdateGenreDto } from './dto/update-genre.dto.js';
import { GenresService } from './genres.service.js';

@Controller('genres')
export class GenresController {
  constructor(private readonly genresService: GenresService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LIBRARIAN')
  create(@Body() dto: CreateGenreDto) {
    return this.genresService.create(dto);
  }

  @Get()
  findAll() {
    return this.genresService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.genresService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LIBRARIAN')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGenreDto) {
    return this.genresService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LIBRARIAN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.genresService.remove(id);
  }
}
```

### `api/src/genres/genres.service.ts`

```ts
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
```

### `api/src/genres/genres.module.ts`

```ts
import { Module } from '@nestjs/common';
import { GenresController } from './genres.controller.js';
import { GenresService } from './genres.service.js';

@Module({
  controllers: [GenresController],
  providers: [GenresService],
})
export class GenresModule {}
```

### `api/src/books/dto/create-book.dto.ts`

```ts
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBookDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  author!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9-]{10,17}$/, {
    message: 'isbn must be 10 to 17 digits (hyphens allowed)',
  })
  isbn!: string;

  @IsInt()
  @Min(1)
  totalCopies!: number;

  @IsInt()
  @Min(1)
  genreId!: number;

  // Optional: defaults to "<title> by <author>." in the service
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;
}
```

### `api/src/books/books.controller.ts`

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { BooksService } from './books.service.js';
import { CreateBookDto } from './dto/create-book.dto.js';
import { UpdateBookDto } from './dto/update-book.dto.js';

// Query-string values arrive as text, so convert and check them here
function toPositiveInt(
  value: string | undefined,
  name: string,
  fallback?: number,
): number | undefined {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(`${name} must be a positive whole number`);
  }
  return parsed;
}

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  // Public. Example: GET /books?genreId=2&search=dune&page=1&limit=10
  @Get()
  findAll(
    @Query('genreId') genreId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.booksService.findAll({
      genreId: toPositiveInt(genreId, 'genreId'),
      search: search?.trim() || undefined,
      page: toPositiveInt(page, 'page', 1) ?? 1,
      limit: Math.min(toPositiveInt(limit, 'limit', 10) ?? 10, 100),
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.booksService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LIBRARIAN')
  create(@Body() dto: CreateBookDto) {
    return this.booksService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LIBRARIAN')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBookDto) {
    return this.booksService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LIBRARIAN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.booksService.remove(id);
  }
}
```

### `api/src/books/books.service.ts`

```ts
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
```

### `api/src/auth/auth.controller.ts`

```ts
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // At most 5 login attempts per minute per IP address
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
```

### `api/src/auth/auth.service.ts`

```ts
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
```

### `api/src/auth/auth.module.ts`

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: 3600 }, // tokens last 1 hour (seconds)
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

### `api/src/auth/jwt.strategy.ts`

```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtUser } from './jwt-user.interface.js';

interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not set. Add it to api/.env');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // Runs after the token signature is verified. The returned object becomes req.user
  validate(payload: JwtPayload): JwtUser {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
```

### `api/src/auth/jwt-auth.guard.ts`

```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Rejects requests without a valid "Authorization: Bearer <token>" header (401)
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

### `api/src/auth/roles.decorator.ts`

```ts
import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

// Usage: @Roles('LIBRARIAN') on a route handler
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

### `api/src/auth/roles.guard.ts`

```ts
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
```

### `api/src/main.ts`

```ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

The Postman collection is in `docs/postman_collection.json`.
