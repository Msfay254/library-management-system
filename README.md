# Library Management System

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
