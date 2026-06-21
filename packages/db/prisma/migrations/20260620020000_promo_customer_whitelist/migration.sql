-- Per-customer promo whitelist: a promo code with one or more rows here is usable
-- ONLY by the listed customers; a code with zero rows stays public (any customer).

-- CreateTable
CREATE TABLE "PromoCodeCustomer" (
    "promoCode" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeCustomer_pkey" PRIMARY KEY ("promoCode","customerId")
);

-- CreateIndex
CREATE INDEX "PromoCodeCustomer_customerId_idx" ON "PromoCodeCustomer"("customerId");

-- AddForeignKey
ALTER TABLE "PromoCodeCustomer" ADD CONSTRAINT "PromoCodeCustomer_promoCode_fkey" FOREIGN KEY ("promoCode") REFERENCES "PromoCode"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeCustomer" ADD CONSTRAINT "PromoCodeCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
