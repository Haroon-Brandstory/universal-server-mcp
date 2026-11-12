-- Curated test migration (PostgreSQL). Not for production.
CREATE TABLE IF NOT EXISTS migrated (
  id SERIAL PRIMARY KEY,
  note TEXT
);
