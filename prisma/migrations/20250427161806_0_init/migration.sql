-- CreateEnum
CREATE TYPE "network" AS ENUM ('mainnet', 'devnet');

-- CreateTable
CREATE TABLE "nft" (
    "asset_id" TEXT NOT NULL,
    "network" "network" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,

    CONSTRAINT "asset_id" PRIMARY KEY ("asset_id")
);
