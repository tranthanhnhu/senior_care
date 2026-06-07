# Supabase Setup Guide

## 1. Tao project
1. Dang ky tai [supabase.com](https://supabase.com) (free tier).
2. **New Project** → dat ten, chon region gan ban.

## 2. Chay schema
1. Vao **SQL Editor** → **New query**.
2. Copy toan bo noi dung file `schema.sql` → **Run**.

## 3. Bat Email + Password (dang nhap ngay, khong can magic link)

1. Vao **Authentication** → **Providers** → **Email**.
2. Bat **Enable Email provider**.
3. **TAT** **Confirm email** (bat buoc — neu bat thi phai xac nhan mail moi vao duoc).
4. (Tuy chon) Tat **Secure email change** neu chi dung cho demo.
5. Vao **Authentication** → **URL Configuration**:
   - **Site URL**: `http://localhost:8000` (dev) hoac URL Render sau khi deploy.
   - **Redirect URLs**: them `http://localhost:8000/**` va `https://your-app.onrender.com/**`.

## 4. Lay API keys
1. Vao **Project Settings** → **API**.
2. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`

## 5. Dien vao `.env`
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
OPENAI_API_KEY=sk-...
USE_OPENAI=True
```

## 6. Seed du lieu mau
Sau khi dang nhap lan dau, ung dung tu dong them thuoc/danh ba mau neu tai khoan chua co du lieu.
