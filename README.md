# Universal Shopping Search

V1.1: a database-backed product comparison engine for Indonesian marketplaces.

## Current scope

- Electronics / computer accessories first
- Canonical products separated from marketplace listings
- SQLite database for local development
- Prisma ORM
- Product search API at `/api/products?q=...`
- Compare marketplace listings and sort by price
- Affiliate-ready outbound links
- Seed data for Shopee, Tokopedia, and Lazada examples

## Architecture

```text
Next.js UI
    ↓
/api/products
    ↓
Prisma
    ↓
SQLite (local MVP)
    ↓
Products → Marketplace Listings
```

The database is deliberately designed so we can move from SQLite to PostgreSQL later without changing the product/listing model.

## Run

```bash
npm install
npm run db:setup
npm run dev
```

Open http://localhost:3000.

## Database

`.env.example` contains the local SQLite connection string. Copy it to `.env` before running the database commands if your environment does not already provide `DATABASE_URL`.

Useful commands:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

## Next milestones

1. Replace seed data with permitted marketplace/supplier feeds.
2. Add canonical product matching and normalization.
3. Store real marketplace and affiliate URLs.
4. Add price history and freshness checks.
5. Move production storage to PostgreSQL.
6. Add affiliate attribution and click tracking.
