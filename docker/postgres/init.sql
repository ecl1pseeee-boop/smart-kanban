-- Postgres init script for Smart Kanban
-- Runs once on first container start (when the data directory is empty).
-- The role/database are created by POSTGRES_USER/POSTGRES_DB env vars,
-- so this file only adds extensions Prisma may need.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
