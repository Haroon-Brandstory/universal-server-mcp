-- Curated test migration (MySQL). Not for production.
CREATE TABLE IF NOT EXISTS migrated (
  id INT AUTO_INCREMENT PRIMARY KEY,
  note VARCHAR(255) NULL
);
