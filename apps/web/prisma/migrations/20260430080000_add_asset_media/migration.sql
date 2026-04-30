-- Per-asset media library.
--
-- Every REPE IM cover has at least one hero photo; the underwriting
-- deck adds site plan / floorplan / renders. We store the bytes via
-- the same DocumentStorageAdapter the document module uses (local FS
-- in dev, S3-compatible in prod), and persist only the storagePath.
--
-- `kind` is TEXT so the taxonomy can expand (HERO / EXTERIOR /
-- INTERIOR / SITE_PLAN / FLOORPLAN / RENDER / DRONE / FLOORPLATE /
-- ...) without a schema migration.

CREATE TABLE IF NOT EXISTS "AssetMedia" (
    "id"           TEXT NOT NULL,
    "assetId"      TEXT NOT NULL,
    "kind"         TEXT NOT NULL DEFAULT 'PHOTO',
    "storagePath"  TEXT NOT NULL,
    "mimeType"     TEXT NOT NULL,
    "sizeBytes"    INTEGER NOT NULL,
    "caption"      TEXT,
    "sortOrder"    INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMedia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssetMedia_assetId_fkey" FOREIGN KEY ("assetId")
      REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AssetMedia_assetId_sortOrder_idx"
  ON "AssetMedia"("assetId", "sortOrder");
