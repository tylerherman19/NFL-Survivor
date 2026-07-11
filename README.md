This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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

## Testing Mode (sandbox)

The admin can rehearse the entire game — test users, a custom test schedule, picks,
deadlines, grading, eliminations, auto-assign — against a fully separate sandbox that
never touches production data.

**One-time setup**

1. Run `supabase/migrations/004_testing_sandbox.sql` in the Supabase SQL editor. It
   creates a `sandbox` schema mirroring the production tables.
2. In the Supabase Dashboard: **Settings → API → Exposed schemas** — add `sandbox`.

**Using it**

- Go to **Admin → Testing** and hit *Enter Testing Mode*. From then on, that browser
  (and only that browser) sees the whole site running against the sandbox schema —
  a striped 🧪 banner marks every page. Other visitors keep seeing production,
  including the CDN-cached pages.
- *Seed Test Week + Users* creates test players (PIN `1234`) and a one-week slate;
  or build any schedule you like in Admin → Schedule while testing mode is on.
- The invite link drops another device into the sandbox without admin access.
- *Reset Sandbox* wipes all sandbox data. *Exit Testing Mode* (or closing the
  browser) returns to production.

Under the hood: testing mode is a signed cookie plus Next.js draft mode. Draft mode
bypasses ISR for the testing browser, and every server-side query resolves its
Supabase client through `getDb()` (`src/lib/testMode.ts`), which picks the `sandbox`
schema only when the cookie verifies. Player sessions are stamped with the
environment they were created in, so a sandbox login can never leak into production.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
