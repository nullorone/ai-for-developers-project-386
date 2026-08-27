import { IsDefined, IsString, Matches } from 'class-validator';

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export class SlotRangeDto {
  @IsDefined()
  @IsString()
  @Matches(UTC_TIMESTAMP, { message: 'from must be RFC 3339 UTC with second precision.' })
  from!: string;

  @IsDefined()
  @IsString()
  @Matches(UTC_TIMESTAMP, { message: 'to must be RFC 3339 UTC with second precision.' })
  to!: string;
}
