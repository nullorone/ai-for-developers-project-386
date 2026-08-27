CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED');
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');
CREATE TYPE "NotificationStatus" AS ENUM ('PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "calendars" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "slug" VARCHAR(64) NOT NULL,
  "title" VARCHAR(120) NOT NULL, "description" VARCHAR(1000), "owner_time_zone" VARCHAR(64) NOT NULL,
  "slot_duration_minutes" INTEGER NOT NULL DEFAULT 30, "minimum_lead_time_minutes" INTEGER NOT NULL DEFAULT 60,
  "booking_horizon_days" INTEGER NOT NULL DEFAULT 90, "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(0) NOT NULL, CONSTRAINT "calendars_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendar_settings_check" CHECK ("slot_duration_minutes" = 30 AND "minimum_lead_time_minutes" = 60 AND "booking_horizon_days" = 90)
);
CREATE UNIQUE INDEX "calendars_slug_key" ON "calendars"("slug");

CREATE TABLE "availability_windows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "calendar_id" UUID NOT NULL,
  "starts_at" TIMESTAMPTZ(0) NOT NULL, "ends_at" TIMESTAMPTZ(0) NOT NULL,
  "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "availability_windows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "availability_bounds_check" CHECK ("ends_at" > "starts_at" AND "ends_at" <= "starts_at" + INTERVAL '14 days'),
  CONSTRAINT "availability_grid_check" CHECK (date_part('minute', "starts_at" AT TIME ZONE 'UTC') IN (0, 30) AND date_part('second', "starts_at" AT TIME ZONE 'UTC') = 0 AND date_part('minute', "ends_at" AT TIME ZONE 'UTC') IN (0, 30) AND date_part('second', "ends_at" AT TIME ZONE 'UTC') = 0)
);
CREATE INDEX "availability_calendar_range_idx" ON "availability_windows"("calendar_id", "starts_at", "ends_at");
-- Prisma cannot express a PostgreSQL range exclusion constraint. This is the
-- concurrency-safe source of truth for A-5; adjacent half-open ranges are allowed.
ALTER TABLE "availability_windows" ADD CONSTRAINT "availability_no_overlap" EXCLUDE USING gist
  ("calendar_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&);

CREATE TABLE "bookings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "calendar_id" UUID NOT NULL,
  "starts_at" TIMESTAMPTZ(0) NOT NULL, "ends_at" TIMESTAMPTZ(0) NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED', "guest_name" VARCHAR(80) NOT NULL,
  "guest_email" VARCHAR(254) NOT NULL, "comment" VARCHAR(500), "management_token_hash" CHAR(64) NOT NULL,
  "cancelled_at" TIMESTAMPTZ(0), "rescheduled_at" TIMESTAMPTZ(0),
  "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(0) NOT NULL,
  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_duration_grid_check" CHECK ("ends_at" = "starts_at" + INTERVAL '30 minutes' AND date_part('minute', "starts_at" AT TIME ZONE 'UTC') IN (0, 30) AND date_part('second', "starts_at" AT TIME ZONE 'UTC') = 0),
  CONSTRAINT "booking_cancel_state_check" CHECK (("status" = 'CONFIRMED' AND "cancelled_at" IS NULL) OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "bookings_management_token_hash_key" ON "bookings"("management_token_hash");
CREATE INDEX "booking_owner_list_idx" ON "bookings"("calendar_id", "status", "starts_at");

CREATE TABLE "slot_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "calendar_id" UUID NOT NULL, "booking_id" UUID NOT NULL,
  "starts_at" TIMESTAMPTZ(0) NOT NULL, "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "released_at" TIMESTAMPTZ(0), "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "slot_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservation_release_state_check" CHECK (("status" = 'ACTIVE' AND "released_at" IS NULL) OR ("status" = 'RELEASED' AND "released_at" IS NOT NULL)),
  CONSTRAINT "reservation_grid_check" CHECK (date_part('minute', "starts_at" AT TIME ZONE 'UTC') IN (0, 30) AND date_part('second', "starts_at" AT TIME ZONE 'UTC') = 0)
);
CREATE INDEX "reservation_slot_query_idx" ON "slot_reservations"("calendar_id", "status", "starts_at");
CREATE INDEX "reservation_booking_idx" ON "slot_reservations"("booking_id", "status");
-- Prisma has no partial unique indexes. Only ACTIVE rows contend, so cancelled
-- bookings keep history while a later booking may reserve the released slot.
CREATE UNIQUE INDEX "reservation_one_active_slot" ON "slot_reservations"("calendar_id", "starts_at") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "reservation_one_active_booking" ON "slot_reservations"("booking_id") WHERE "status" = 'ACTIVE';

CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "aggregate_type" VARCHAR(64) NOT NULL, "aggregate_id" UUID NOT NULL,
  "event_type" VARCHAR(128) NOT NULL, "payload" JSONB NOT NULL, "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "available_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(0), "last_error" TEXT, "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"), CONSTRAINT "outbox_attempts_check" CHECK ("attempts" >= 0)
);
CREATE INDEX "outbox_pending_idx" ON "outbox_events"("status", "available_at", "created_at");

CREATE TABLE "notification_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "event_id" UUID NOT NULL, "event_type" VARCHAR(128) NOT NULL,
  "booking_id" UUID NOT NULL, "recipient" VARCHAR(254) NOT NULL, "status" "NotificationStatus" NOT NULL DEFAULT 'PROCESSING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "last_error" TEXT, "processed_at" TIMESTAMPTZ(0),
  "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(0) NOT NULL,
  CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id"), CONSTRAINT "notification_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "notification_logs_event_id_key" ON "notification_logs"("event_id");
CREATE INDEX "notification_status_idx" ON "notification_logs"("status", "created_at");

ALTER TABLE "availability_windows" ADD CONSTRAINT "availability_windows_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "slot_reservations" ADD CONSTRAINT "slot_reservations_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "slot_reservations" ADD CONSTRAINT "slot_reservations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
