# MyMoney

A **local personal budgeting app**: bank groups, accounts, and transactions in a single SQLite database. Import official bank CSV exports (e.g. mBank, Pekao); duplicates are filtered automatically. The UI is React + Vite, the API is a small Express server with `better-sqlite3` — everything runs on your machine, no cloud.

## Features

- **Groups & accounts** — custom names, group colors, optional account number
- **CSV import** — format detection (mBank list / statement, Pekao), hash-based deduplication
- **Account dashboard** — income, expenses, balance, transaction list
- **Overview ** — aggregate stats, cumulative balance chart

## Preview

<!-- Add your screenshot, e.g. save as docs/screenshot.png and uncomment: -->

<!-- ![MyMoney app preview](docs/screenshot.png) -->

*(screenshot placeholder)*

## Running locally

**Requirements:** Node.js (e.g. 20 LTS or newer).

1. **Install dependencies** (from the project root):

   ```bash
   npm install
   ```

2. **Start the web app and API together:**

   ```bash
   npm run dev
   ```

   - UI: **http://localhost:5173** (Vite proxies `/api` to the backend)
   - API: **http://localhost:5174**

3. **Use the app** — open `http://localhost:5173`, create a bank group and an account, then import a CSV from your bank. The **`mymoney.db`** file is created automatically on first API start (it is gitignored — do not commit it).

**Production build (optional):** `npm run build` outputs static files to `dist/`; you still need to run the API separately (`npm run dev:api` or `tsx server/index.ts`).
