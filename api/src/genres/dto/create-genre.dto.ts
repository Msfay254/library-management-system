import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateGenreDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  // Optional: if omitted, the service builds it from the name ("Science Fiction" -> "science-fiction")
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers and hyphens',
  })
  slug?: string;
}
