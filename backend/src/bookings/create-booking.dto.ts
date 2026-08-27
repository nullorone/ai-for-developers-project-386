import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const SLOT_BOUNDARY = /^\d{4}-\d{2}-\d{2}T\d{2}:(?:00|30):00Z$/;
// The contract explicitly excludes ASCII control characters from guest names.
// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001F\u007F]+$/;
const MAX_COMMENT_LINES = /^(?:[^\r\n]*(?:\r?\n|$)){0,10}$/;

export class CreateBookingDto {
  @IsDefined()
  @IsString()
  @Matches(SLOT_BOUNDARY, {
    message: 'startsAt must be RFC 3339 UTC on a 30-minute boundary.',
  })
  startsAt!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsDefined()
  @IsString()
  @Length(2, 80)
  @Matches(NO_CONTROL_CHARACTERS, { message: 'guestName must not contain control characters.' })
  guestName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsDefined()
  @IsString()
  @IsEmail()
  @Length(3, 254)
  guestEmail!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(MAX_COMMENT_LINES, { message: 'comment must contain no more than 10 lines.' })
  comment?: string | null;
}
