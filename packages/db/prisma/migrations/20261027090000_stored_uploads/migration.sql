-- Uploaded images kept in the database when no bucket is set up.
CREATE TABLE "stored_uploads" (
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_uploads_pkey" PRIMARY KEY ("name")
);
