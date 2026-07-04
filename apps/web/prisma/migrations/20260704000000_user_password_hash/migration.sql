-- DB-backed operator credentials: optional scrypt password hash on the
-- canonical User seat. Nullable — env-credential and SSO/SCIM seats simply
-- leave it NULL. Guarded for drift-safe re-application.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
