import { IsOptional, IsString, Matches } from 'class-validator';

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export class RescheduleRangeDto {
  @IsOptional()
  @IsString()
  @Matches(UTC_TIMESTAMP, { message: 'from must be RFC 3339 UTC with second precision.' })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(UTC_TIMESTAMP, { message: 'to must be RFC 3339 UTC with second precision.' })
  to?: string;
}
