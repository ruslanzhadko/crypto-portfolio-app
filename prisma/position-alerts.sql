-- Additive: position notification settings and position entries in the alert log.
BEGIN;
ALTER TABLE "User" ADD COLUMN "positionAlerts" JSONB;
ALTER TABLE "NotificationLog" ADD COLUMN "kind" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN "details" JSONB;
COMMIT;
