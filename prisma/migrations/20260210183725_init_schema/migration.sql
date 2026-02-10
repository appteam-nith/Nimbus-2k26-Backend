-- CreateEnum
CREATE TYPE "TradeType" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "User" (
    "user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "google_id" TEXT NOT NULL,
    "virtual_balance" DECIMAL(18,2) NOT NULL DEFAULT 10000.00,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "Club" (
    "club_id" SERIAL NOT NULL,
    "club_name" TEXT NOT NULL,
    "department" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("club_id")
);

-- CreateTable
CREATE TABLE "Event" (
    "event_id" SERIAL NOT NULL,
    "event_name" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "image_url" TEXT,
    "extra_details" JSONB,
    "event_time" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizing_club_id" INTEGER NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "stock_id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "current_price" DECIMAL(18,4) NOT NULL DEFAULT 10.00,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "club_id" INTEGER NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("stock_id")
);

-- CreateTable
CREATE TABLE "StockPrice" (
    "price_id" SERIAL NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stock_id" INTEGER NOT NULL,

    CONSTRAINT "StockPrice_pkey" PRIMARY KEY ("price_id")
);

-- CreateTable
CREATE TABLE "UserPortfolio" (
    "user_id" UUID NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "shares_owned" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "avg_buy_price" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "UserPortfolio_pkey" PRIMARY KEY ("user_id","stock_id")
);

-- CreateTable
CREATE TABLE "TradeTransaction" (
    "transaction_id" SERIAL NOT NULL,
    "trade" "TradeType" NOT NULL,
    "shares" DECIMAL(18,6) NOT NULL,
    "price_per_share" DECIMAL(18,4) NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL,
    "stock_id" INTEGER NOT NULL,

    CONSTRAINT "TradeTransaction_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_google_id_key" ON "User"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "Club_club_name_key" ON "Club"("club_name");

-- CreateIndex
CREATE INDEX "Event_event_time_idx" ON "Event"("event_time");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_symbol_key" ON "Stock"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_club_id_key" ON "Stock"("club_id");

-- CreateIndex
CREATE INDEX "StockPrice_stock_id_recorded_at_idx" ON "StockPrice"("stock_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "UserPortfolio_user_id_idx" ON "UserPortfolio"("user_id");

-- CreateIndex
CREATE INDEX "TradeTransaction_user_id_executed_at_idx" ON "TradeTransaction"("user_id", "executed_at" DESC);

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizing_club_id_fkey" FOREIGN KEY ("organizing_club_id") REFERENCES "Club"("club_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "Club"("club_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPrice" ADD CONSTRAINT "StockPrice_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "Stock"("stock_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPortfolio" ADD CONSTRAINT "UserPortfolio_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPortfolio" ADD CONSTRAINT "UserPortfolio_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "Stock"("stock_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeTransaction" ADD CONSTRAINT "TradeTransaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeTransaction" ADD CONSTRAINT "TradeTransaction_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "Stock"("stock_id") ON DELETE CASCADE ON UPDATE CASCADE;
