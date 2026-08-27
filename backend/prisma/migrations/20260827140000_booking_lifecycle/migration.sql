CREATE TABLE "idempotency_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "calendar_id" UUID NOT NULL,
  "operation" VARCHAR(64) NOT NULL,
  "key_hash" CHAR(64) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "response_ciphertext" TEXT NOT NULL,
  "response_iv" VARCHAR(32) NOT NULL,
  "response_auth_tag" VARCHAR(32) NOT NULL,
  "expires_at" TIMESTAMPTZ(0) NOT NULL,
  "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_scope_key"
  ON "idempotency_records"("calendar_id", "operation", "key_hash");
CREATE INDEX "idempotency_expiry_idx" ON "idempotency_records"("expires_at");
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_calendar_id_fkey"
  FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
