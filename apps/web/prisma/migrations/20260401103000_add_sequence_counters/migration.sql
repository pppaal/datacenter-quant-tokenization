CREATE TABLE "SequenceCounter" (
  "key" TEXT NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("key")
);
