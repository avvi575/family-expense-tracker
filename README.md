# Family Expense Tracker

Track family expenses across web and mobile clients via a single NestJS + SQLite API.

## Structure

```
backend/   NestJS 11 REST API (Prisma, JWT auth, nodemailer, multer uploads)
web/       React 18 + Vite 6 + Tailwind CSS 4
```

## Quick start (local, SQLite — no Docker needed)

```bash
# 1. Backend (API on http://localhost:3000/api/v1)
cd backend
npm install
npx prisma migrate deploy   # applies schema migrations to prisma/dev.db
npm run seed                # optional: seeds base categories (Groceries, Utilities, ...)
npm run start               # production build server (also serves web/dist)
# or: npm run start:dev     # watch mode for development

# 2. Web (first-time build, then the backend serves it)
cd ../web
npm install
npm run build               # outputs to web/dist — served by the backend
# or: npm run dev           # dev server on http://localhost:5173 (proxies /api -> :3000)
```

App runs at **http://localhost:3000** once backend is up and web is built.

## Environment (backend/.env — cp .env.example .env)

```
DATABASE_URL="file:./dev.db"
JWT_SECRET="change_me_in_production"
PORT=3000
APP_BASE_URL="http://localhost:3000"     # invite links point here
# SMTP_URL="smtp://user:pass@host:587"   # without it, invites go to backend/outbox/
# MAIL_FROM="Family Expense Tracker <no-reply@yourdomain.com>"
# SMS_WEBHOOK_URL="https://your-sms-gateway/send"   # POST {phone, body}
# WHATSAPP_WEBHOOK_URL="https://your-whatsapp/send" # POST {phone, body}
```

## Features
- Family accounts with roles (ADMIN / MEMBER / VIEWER)
- Email + SMS/WhatsApp invitations with a one-time, 7-day link:
  public accept page → set password → auto-join with the invited role
- Expenses with categories, payment method, receipt uploads, notes
- **Recurring expenses** (admin-only): weekly / monthly / quarterly / half-yearly / annual,
  auto-materialized into real expenses and included in monthly reports
- Monthly budgets per category with on-crossing budget alerts
- Savings goals with contributions
- Dashboard charts (category pie, daily bar, by-member totals)
- Notifications feed with unread badge
- Admin-managed alert rules (expenses_total / budget_over) triggered on new expenses
