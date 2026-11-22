import sqlite3
from datetime import date, datetime
from zoneinfo import ZoneInfo
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from .auth import require_partner, require_role
from .db import connect

router = APIRouter()
curator = require_role("curator")
reviewer = require_role("reviewer")
visitor = require_role("visitor")

Slug = Annotated[str, StringConstraints(min_length=3, max_length=80, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class RevisionInput(BaseModel):
    title: ShortText
    category: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    review: LongText
    cost: ShortText
    access: ShortText
    etiquette: ShortText


class DestinationInput(RevisionInput):
    slug: Slug


class VerificationInput(BaseModel):
    checked_on: date
    field_notes: LongText

    @field_validator("checked_on")
    @classmethod
    def check_date(cls, value):
        if value > datetime.now(ZoneInfo("Asia/Makassar")).date():
            raise ValueError("Visit date cannot be in the future")
        return value


class Destination(RevisionInput):
    slug: str
    checked_on: date
    published_at: str
    rating_average: float | None
    rating_count: int
    like_count: int


class Revision(RevisionInput):
    model_config = ConfigDict(extra="ignore")

    id: int
    status: str
    checked_on: date | None
    field_notes: str | None
    created_by: int
    approved_by: int | None
    published_at: str | None


PUBLIC_DESTINATIONS = """
SELECT d.slug, r.title, r.category, r.latitude, r.longitude, r.review,
       r.cost, r.access, r.etiquette, r.checked_on, r.published_at,
       (SELECT ROUND(AVG(score), 2) FROM ratings
        WHERE destination_id = d.id AND status = 'approved') AS rating_average,
       (SELECT COUNT(*) FROM ratings
        WHERE destination_id = d.id AND status = 'approved') AS rating_count,
       (SELECT COUNT(*) FROM likes WHERE destination_id = d.id) AS like_count
FROM destinations d JOIN revisions r ON r.destination_id = d.id
WHERE r.status = 'published'
"""


def find_destination(db, slug, published=False):
    query = "SELECT id FROM destinations WHERE slug = ?"
    if published:
        query += " AND EXISTS (SELECT 1 FROM revisions WHERE destination_id = destinations.id AND status = 'published')"
    row = db.execute(query, (slug,)).fetchone()
    if row is None:
        raise HTTPException(404, "Destination not found")
    return row["id"]


def find_draft(db, slug):
    destination_id = find_destination(db, slug)
    row = db.execute(
        "SELECT * FROM revisions WHERE destination_id = ? AND status = 'draft'", (destination_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(409, "No draft for this destination")
    return row


def insert_revision(db, destination_id, data, author):
    result = db.execute(
        """INSERT INTO revisions
           (destination_id, title, category, latitude, longitude, review, cost, access, etiquette, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (destination_id, data.title, data.category, data.latitude, data.longitude,
         data.review, data.cost, data.access, data.etiquette, author),
    )
    return {"revision_id": result.lastrowid, "status": "draft"}


@router.get("/destinations", response_model=list[Destination], tags=["Explore"])
@router.get("/partner/destinations", response_model=list[Destination], tags=["Partners"],
            dependencies=[Depends(require_partner)])
def list_destinations(
    q: Annotated[str, Query(max_length=120)] = "",
    category: Annotated[str, Query(max_length=60)] = "",
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
):
    with connect() as db:
        rows = db.execute(
            PUBLIC_DESTINATIONS + """
            AND (? = '' OR instr(lower(r.title), lower(?)) > 0
                        OR instr(lower(r.review), lower(?)) > 0)
            AND (? = '' OR lower(r.category) = lower(?))
            ORDER BY r.title, d.id LIMIT ? OFFSET ?
            """,
            (q, q, q, category, category, limit, offset),
        ).fetchall()
    return [dict(row) for row in rows]


@router.get("/destinations/{slug}", response_model=Destination, tags=["Explore"])
@router.get("/partner/destinations/{slug}", response_model=Destination, tags=["Partners"],
            dependencies=[Depends(require_partner)])
def destination_detail(slug: Slug):
    with connect() as db:
        row = db.execute(PUBLIC_DESTINATIONS + " AND d.slug = ?", (slug,)).fetchone()
    if row is None:
        raise HTTPException(404, "Destination not found")
    return dict(row)


@router.post("/curation/destinations", status_code=201, tags=["Curation"])
def create_destination(data: DestinationInput, user=Depends(curator)):
    with connect(write=True) as db:
        result = db.execute(
            "INSERT INTO destinations (slug) VALUES (?) ON CONFLICT(slug) DO NOTHING",
            (data.slug,),
        )
        if not result.rowcount:
            raise HTTPException(409, "Destination slug already exists")
        return insert_revision(db, result.lastrowid, data, user["id"])


@router.post("/curation/destinations/{slug}/revisions", status_code=201, tags=["Curation"])
def create_revision(slug: Slug, data: RevisionInput, user=Depends(curator)):
    with connect(write=True) as db:
        destination_id = find_destination(db, slug)
        try:
            return insert_revision(db, destination_id, data, user["id"])
        except sqlite3.IntegrityError:
            raise HTTPException(409, "A draft already exists") from None


@router.get("/curation/destinations", tags=["Curation"], dependencies=[Depends(curator)])
@router.get("/review/destinations", tags=["Curation"], dependencies=[Depends(reviewer)])
def curation_queue(
    status: Annotated[str | None, Query(pattern=r"^(draft|published|archived)$")] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
):
    with connect() as db:
        rows = db.execute(
            """SELECT d.slug, r.id AS revision_id, r.title, r.status, r.checked_on
               FROM revisions r JOIN destinations d ON d.id = r.destination_id
               WHERE (? IS NULL OR r.status = ?)
               ORDER BY r.id DESC LIMIT ? OFFSET ?""",
            (status, status, limit, offset),
        ).fetchall()
    return [dict(row) for row in rows]


@router.get("/curation/destinations/{slug}/revisions", response_model=list[Revision], tags=["Curation"],
            dependencies=[Depends(curator)])
@router.get("/review/destinations/{slug}/revisions", response_model=list[Revision], tags=["Curation"],
            dependencies=[Depends(reviewer)])
def revision_history(slug: Slug):
    with connect() as db:
        destination_id = find_destination(db, slug)
        rows = db.execute(
            "SELECT * FROM revisions WHERE destination_id = ? ORDER BY id DESC",
            (destination_id,),
        ).fetchall()
    return [dict(row) for row in rows]


@router.put("/curation/destinations/{slug}/draft", tags=["Curation"])
def edit_draft(slug: Slug, data: RevisionInput, user=Depends(curator)):
    with connect(write=True) as db:
        draft = find_draft(db, slug)
        db.execute(
            """UPDATE revisions SET title = ?, category = ?, latitude = ?, longitude = ?,
               review = ?, cost = ?, access = ?, etiquette = ?, checked_on = NULL,
               field_notes = NULL, created_by = ? WHERE id = ?""",
            (data.title, data.category, data.latitude, data.longitude, data.review,
             data.cost, data.access, data.etiquette, user["id"], draft["id"]),
        )
    return {"revision_id": draft["id"], "status": "draft"}


@router.put("/curation/destinations/{slug}/verification", tags=["Curation"], dependencies=[Depends(curator)])
def record_verification(slug: Slug, data: VerificationInput):
    with connect(write=True) as db:
        draft = find_draft(db, slug)
        db.execute(
            "UPDATE revisions SET checked_on = ?, field_notes = ? WHERE id = ?",
            (data.checked_on.isoformat(), data.field_notes, draft["id"]),
        )
    return {"revision_id": draft["id"], "checked_on": data.checked_on}


@router.post("/review/destinations/{slug}/revisions/{revision_id}/publish", tags=["Curation"])
def publish_revision(slug: Slug, revision_id: int, user=Depends(reviewer)):
    with connect(write=True) as db:
        destination_id = find_destination(db, slug)
        revision = db.execute(
            "SELECT * FROM revisions WHERE id = ? AND destination_id = ?",
            (revision_id, destination_id),
        ).fetchone()
        if revision is None:
            raise HTTPException(404, "Revision not found")
        if revision["status"] != "draft":
            raise HTTPException(409, "Only a draft can be published")
        if not revision["checked_on"] or not revision["field_notes"]:
            raise HTTPException(409, "Field verification is required")
        if revision["created_by"] == user["id"]:
            raise HTTPException(403, "The draft author cannot approve publication")
        db.execute(
            "UPDATE revisions SET status = 'archived' WHERE destination_id = ? AND status = 'published'",
            (destination_id,),
        )
        db.execute(
            """UPDATE revisions SET status = 'published', approved_by = ?,
               published_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?""",
            (user["id"], revision_id),
        )
    return {"revision_id": revision_id, "status": "published"}


@router.get("/me/favorites", response_model=list[Destination], tags=["Explore"])
def favorites(
    user=Depends(visitor),
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
):
    with connect() as db:
        rows = db.execute(
            PUBLIC_DESTINATIONS + """
            AND EXISTS (SELECT 1 FROM favorites WHERE destination_id = d.id AND user_id = ?)
            ORDER BY r.title, d.id LIMIT ? OFFSET ?
            """,
            (user["id"], limit, offset),
        ).fetchall()
    return [dict(row) for row in rows]


@router.put("/me/favorites/{slug}", status_code=204, tags=["Explore"])
def add_favorite(slug: Slug, user=Depends(visitor)):
    with connect(write=True) as db:
        destination_id = find_destination(db, slug, published=True)
        db.execute("INSERT OR IGNORE INTO favorites VALUES (?, ?)", (user["id"], destination_id))


@router.delete("/me/favorites/{slug}", status_code=204, tags=["Explore"])
def remove_favorite(slug: Slug, user=Depends(visitor)):
    with connect(write=True) as db:
        destination_id = find_destination(db, slug, published=True)
        db.execute("DELETE FROM favorites WHERE user_id = ? AND destination_id = ?", (user["id"], destination_id))


@router.get("/me/likes", response_model=list[str], tags=["Explore"])
def liked_destinations(user=Depends(visitor)):
    with connect() as db:
        rows = db.execute(
            """SELECT d.slug FROM likes l
               JOIN destinations d ON d.id = l.destination_id
               JOIN revisions r ON r.destination_id = d.id AND r.status = 'published'
               WHERE l.user_id = ? ORDER BY d.slug""",
            (user["id"],),
        ).fetchall()
    return [row["slug"] for row in rows]


@router.put("/me/likes/{slug}", status_code=204, tags=["Explore"])
def add_like(slug: Slug, user=Depends(visitor)):
    with connect(write=True) as db:
        destination_id = find_destination(db, slug, published=True)
        db.execute("INSERT OR IGNORE INTO likes VALUES (?, ?)", (user["id"], destination_id))


@router.delete("/me/likes/{slug}", status_code=204, tags=["Explore"])
def remove_like(slug: Slug, user=Depends(visitor)):
    with connect(write=True) as db:
        destination_id = find_destination(db, slug, published=True)
        db.execute("DELETE FROM likes WHERE user_id = ? AND destination_id = ?", (user["id"], destination_id))
