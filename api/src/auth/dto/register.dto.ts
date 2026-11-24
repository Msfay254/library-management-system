import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  // bcrypt only uses the first 72 bytes, so cap the length
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
