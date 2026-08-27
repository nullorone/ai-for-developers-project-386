import { Injectable } from '@nestjs/common';

import type { TimeRange } from './slot.types';

const SLOT_MS = 30 * 60 * 1000;

/** Pure UTC slot calculation; all I/O and wall-clock access stay outside. */
@Injectable()
export class SlotGeneratorService {
  generate(input: {
    range: TimeRange;
    availability: TimeRange[];
    activeReservationStarts: Date[];
    earliestStart: Date;
  }): TimeRange[] {
    const occupied = new Set(input.activeReservationStarts.map((date) => date.getTime()));
    const unique = new Map<number, TimeRange>();

    for (const window of input.availability) {
      for (
        let time = window.startsAt.getTime();
        time + SLOT_MS <= window.endsAt.getTime();
        time += SLOT_MS
      ) {
        if (
          time < input.range.startsAt.getTime() ||
          time >= input.range.endsAt.getTime() ||
          time < input.earliestStart.getTime() ||
          occupied.has(time)
        )
          continue;

        unique.set(time, { startsAt: new Date(time), endsAt: new Date(time + SLOT_MS) });
      }
    }

    return [...unique.values()].sort(
      (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
    );
  }
}
