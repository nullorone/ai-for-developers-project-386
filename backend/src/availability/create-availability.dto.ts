import { IsDefined, IsString, Matches } from 'class-validator';

const SLOT_BOUNDARY = /^\d{4}-\d{2}-\d{2}T\d{2}:(?:00|30):00Z$/;

export class CreateAvailabilityDto {
  @IsDefined()
  @IsString()
  @Matches(SLOT_BOUNDARY, {
    message: 'startsAt must be RFC 3339 UTC on a 30-minute boundary.',
  })
  startsAt!: string;

  @IsDefined()
  @IsString()
  @Matches(SLOT_BOUNDARY, {
    message: 'endsAt must be RFC 3339 UTC on a 30-minute boundary.',
  })
  endsAt!: string;
}
