-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT NOT NULL,
    "modelNumber" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Marketplace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Marketplace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "marketplaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "seller" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "soldCount" INTEGER,
    "sellerTrustScore" INTEGER,
    "productUrl" TEXT NOT NULL,
    "affiliateUrl" TEXT,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "inStock" BOOLEAN NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingObservation" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "rawTitle" TEXT,
    "rawPrice" TEXT,
    "rawSeller" TEXT,
    "rawRating" TEXT,
    "rawReviewCount" TEXT,
    "rawSoldCount" TEXT,
    "extractedData" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "Product"("brand");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Product_modelNumber_idx" ON "Product"("modelNumber");
CREATE UNIQUE INDEX "Marketplace_name_key" ON "Marketplace"("name");
CREATE UNIQUE INDEX "Marketplace_slug_key" ON "Marketplace"("slug");
CREATE UNIQUE INDEX "MarketplaceListing_productId_marketplaceId_productUrl_key" ON "MarketplaceListing"("productId", "marketplaceId", "productUrl");
CREATE INDEX "MarketplaceListing_marketplaceId_idx" ON "MarketplaceListing"("marketplaceId");
CREATE INDEX "MarketplaceListing_price_idx" ON "MarketplaceListing"("price");
CREATE INDEX "MarketplaceListing_sellerTrustScore_idx" ON "MarketplaceListing"("sellerTrustScore");
CREATE INDEX "MarketplaceListing_lastCheckedAt_idx" ON "MarketplaceListing"("lastCheckedAt");
CREATE INDEX "PriceHistory_listingId_observedAt_idx" ON "PriceHistory"("listingId", "observedAt");
CREATE INDEX "PriceHistory_observedAt_idx" ON "PriceHistory"("observedAt");
CREATE INDEX "ListingObservation_listingId_observedAt_idx" ON "ListingObservation"("listingId", "observedAt");
CREATE INDEX "ListingObservation_source_observedAt_idx" ON "ListingObservation"("source", "observedAt");
CREATE INDEX "ListingObservation_confidence_idx" ON "ListingObservation"("confidence");

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingObservation" ADD CONSTRAINT "ListingObservation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
