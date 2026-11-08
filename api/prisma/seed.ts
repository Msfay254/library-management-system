import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clear old data (children first, then parents) so the seed can be re-run safely
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

  const genreCount = await prisma.genre.count();
  const bookCount = await prisma.book.count();
  console.log(`Seed complete: ${genreCount} genres, ${bookCount} books`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
