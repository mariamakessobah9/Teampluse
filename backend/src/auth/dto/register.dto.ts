import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  /**
   * Cree une organisation dont ce compte devient responsable. Exclusif de
   * `invitationToken` ; si les deux manquent, le rattachement se fait par le
   * domaine de l'adresse e-mail.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  organizationName?: string;

  /** Code recu par e-mail pour rejoindre une organisation existante. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  invitationToken?: string;
}
