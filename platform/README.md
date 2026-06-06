# SarapSulit — Filipino Dish Nutrition & Price Recommender

Ranks Filipino recipes by nutritional value per peso, combining three data sources:

| Source | Data |
|---|---|
| **DA Price Monitoring PDF** | Daily commodity prices |
| **Panlasang Pinoy** | Filipino recipes with ingredients and instructions |
| **FNRI Food Composition Table** | Nutritional values per 100g for Filipino foods |

## Stack

- **Next.js 14** (App Router) + **Tailwind CSS**
- **PostgreSQL** + **Prisma 7** + `@prisma/adapter-pg`
- **Cheerio** for scraping · **pdf-parse** for DA PDFs

## Quick Start

```bash
cp .env.example .env      # set DATABASE_URL
npm install
npx prisma migrate dev --name init
npm run dev
```

Visit `/admin` to start the data pipeline (DA → Recipes → Nutrition → Scores).

## Pages

| Route | Description |
|---|---|
| `/` | Top-ranked dishes by value score |
| `/browse` | Filter by produce, protein, cost |
| `/recipe/[slug]` | Full recipe with nutrition label + cost breakdown |
| `/admin` | Data pipeline controls |

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
