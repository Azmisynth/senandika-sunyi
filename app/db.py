import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(os.environ.get("DB_PATH", "data/senandika.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('visitor', 'curator', 'reviewer'))
);

CREATE TABLE IF NOT EXISTS partner_keys (
    name TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS destinations (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS revisions (
    id INTEGER PRIMARY KEY,
    destination_id INTEGER NOT NULL REFERENCES destinations(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    review TEXT NOT NULL,
    cost TEXT NOT NULL,
    access TEXT NOT NULL,
    etiquette TEXT NOT NULL,
    checked_on TEXT,
    field_notes TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    published_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS one_draft
ON revisions(destination_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS one_publication
ON revisions(destination_id) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL REFERENCES users(id),
    destination_id INTEGER NOT NULL REFERENCES destinations(id),
    PRIMARY KEY (user_id, destination_id)
);

CREATE TABLE IF NOT EXISTS likes (
    user_id INTEGER NOT NULL REFERENCES users(id),
    destination_id INTEGER NOT NULL REFERENCES destinations(id),
    PRIMARY KEY (user_id, destination_id)
);

CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY,
    destination_id INTEGER NOT NULL REFERENCES destinations(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
    evidence BLOB NOT NULL,
    evidence_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewer_id INTEGER REFERENCES users(id),
    reviewed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_rating
ON ratings(user_id, destination_id) WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS rating_summary ON ratings(destination_id, status);

CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY,
    destination_id INTEGER NOT NULL REFERENCES destinations(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    description TEXT NOT NULL,
    observed_on TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed')),
    reviewer_id INTEGER REFERENCES users(id),
    reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS report_evidence (
    report_id INTEGER PRIMARY KEY REFERENCES reports(id),
    evidence BLOB NOT NULL,
    evidence_type TEXT NOT NULL
);
"""


@contextmanager
def connect(write=False):
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        if write:
            db.execute("BEGIN IMMEDIATE")
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(SCHEMA)
