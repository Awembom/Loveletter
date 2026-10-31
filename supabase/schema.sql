-- Run once in the Supabase SQL editor.
--
-- body, recipient and sender hold AES-256-GCM ciphertext (see lib/crypto.ts),
-- so the checks below only cap the stored size. The real limits (2000 / 60
-- characters) are checked on the plain text in lib/letters.ts.
create table if not exists public.letters (
  id          text primary key,
  recipient   text check (char_length(recipient) <= 400),
  sender      text check (char_length(sender) <= 400),
  body        text not null check (char_length(body) between 1 and 12000),
  style       text not null default 'allure',
  theme       text not null default 'love' check (theme in ('love', 'friend')),
  created_at  timestamptz not null default now()
);

alter table public.letters enable row level security;
-- No policies: only the server (service role) reads and writes.

-- Migrations for tables created by earlier versions. Safe to run again.

-- 1. Letter type. Existing letters become love letters.
alter table public.letters
  add column if not exists theme text not null default 'love'
  check (theme in ('love', 'friend'));

-- 2. Encryption: ciphertext is longer than the original text.
alter table public.letters
  drop constraint if exists letters_body_check,
  drop constraint if exists letters_recipient_check,
  drop constraint if exists letters_sender_check;
alter table public.letters
  add constraint letters_body_check check (char_length(body) between 1 and 12000),
  add constraint letters_recipient_check check (char_length(recipient) <= 400),
  add constraint letters_sender_check check (char_length(sender) <= 400);
