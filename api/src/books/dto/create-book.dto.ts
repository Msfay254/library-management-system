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
