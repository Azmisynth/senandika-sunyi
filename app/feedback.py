import sqlite3
from datetime import date, datetime
from zoneinfo import ZoneInfo
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, field_validator

from .catalog import LongText, Slug, curator, find_destination, reviewer, visitor
from .db import connect

router = APIRouter(tags=["Feedback"])
MAX_EVIDENCE = 2 * 1024 * 1024
PageSize = Annotated[int, Query(ge=1, le=50)]
Offset = Annotated[int, Query(ge=0, le=10000)]


class RatingDecision(BaseModel):
    status: Literal["approved", "rejected"]


class ReportInput(BaseModel):
    description: LongText
    observed_on: date

    @field_validator("observed_on")
    @classmethod
    def check_date(cls, value):
        if value > datetime.now(ZoneInfo("Asia/Makassar")).date():
            raise ValueError("Observation date cannot be in the future")
        return value


class ReportDecision(BaseModel):
    status: Literal["confirmed", "dismissed"]


def read_image(evidence):
    content = evidence.file.read(MAX_EVIDENCE + 1)
    if len(content) > MAX_EVIDENCE:
        raise HTTPException(413, "Evidence must be at most 2 MiB")
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return content, "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return content, "image/jpeg"
    raise HTTPException(415, "Evidence must be a PNG or JPEG image")


def image_response(row):
    if row is None:
        raise HTTPException(404, "Evidence not found")
    return Response(
        row["evidence"], media_type=row["evidence_type"],
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.post("/destinations/{slug}/ratings", status_code=201)
def submit_rating(
    slug: Slug,
    score: Annotated[int, Form(ge=1, le=5)],
    evidence: Annotated[UploadFile, File(description="JPEG or PNG, up to 2 MiB")],
    user=Depends(visitor),
):
    content, content_type = read_image(evidence)
    with connect(write=True) as db:
        destination_id = find_destination(db, slug, published=True)
        try:
            result = db.execute(
                """INSERT INTO ratings (destination_id, user_id, score, evidence, evidence_type)
                   VALUES (?, ?, ?, ?, ?)""",
                (destination_id, user["id"], score, content, content_type),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "A pending or approved rating already exists") from None
    return {"id": result.lastrowid, "status": "pending"}


@router.get("/me/ratings")
def own_ratings(user=Depends(visitor), limit: PageSize = 20, offset: Offset = 0):
    with connect() as db:
        rows = db.execute(
            """SELECT r.id, d.slug, r.score, r.status, r.reviewed_at
               FROM ratings r JOIN destinations d ON d.id = r.destination_id
               WHERE r.user_id = ? ORDER BY r.id DESC LIMIT ? OFFSET ?""",
            (user["id"], limit, offset),
        ).fetchall()
    return [dict(row) for row in rows]


@router.get("/review/ratings", dependencies=[Depends(reviewer)])
def pending_ratings(limit: PageSize = 20, offset: Offset = 0):
    with connect() as db:
        rows = db.execute(
            """SELECT r.id, d.slug, r.score, r.status
               FROM ratings r JOIN destinations d ON d.id = r.destination_id
               WHERE r.status = 'pending' ORDER BY r.id LIMIT ? OFFSET ?""",
            (limit, offset),
        ).fetchall()
    return [dict(row) for row in rows]


@router.get("/review/ratings/{rating_id}/evidence", dependencies=[Depends(reviewer)],
            response_class=Response, responses={200: {"content": {"image/png": {}, "image/jpeg": {}}}})
def rating_evidence(rating_id: int):
    with connect() as db:
        row = db.execute(
            "SELECT evidence, evidence_type FROM ratings WHERE id = ?", (rating_id,)
        ).fetchone()
    return image_response(row)


def moderate(table, item_id, status, user):
    query = {
        "rating": """UPDATE ratings SET status = ?, reviewer_id = ?,
                     reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                     WHERE id = ? AND status = 'pending'""",
        "report": """UPDATE reports SET status = ?, reviewer_id = ?,
                     reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                     WHERE id = ? AND status = 'pending'""",
    }[table]
    with connect(write=True) as db:
        result = db.execute(query, (status, user["id"], item_id))
        if not result.rowcount:
            raise HTTPException(409, "Item is missing or has already been reviewed")
    return {"id": item_id, "status": status}


@router.patch("/review/ratings/{rating_id}")
def review_rating(rating_id: int, data: RatingDecision, user=Depends(reviewer)):
    return moderate("rating", rating_id, data.status, user)


@router.post("/destinations/{slug}/reports", status_code=201)
def submit_report(slug: Slug, data: ReportInput, user=Depends(visitor)):
    with connect(write=True) as db:
        destination_id = find_destination(db, slug, published=True)
        result = db.execute(
            """INSERT INTO reports (destination_id, user_id, description, observed_on)
               VALUES (?, ?, ?, ?)""",
            (destination_id, user["id"], data.description, data.observed_on.isoformat()),
        )
    return {"id": result.lastrowid, "status": "pending"}


@router.put("/me/reports/{report_id}/evidence", status_code=204)
def attach_report_evidence(
    report_id: int,
    evidence: Annotated[UploadFile, File(description="JPEG or PNG, up to 2 MiB")],
    user=Depends(visitor),
):
    content, content_type = read_image(evidence)
    with connect(write=True) as db:
        report = db.execute(
            "SELECT status FROM reports WHERE id = ? AND user_id = ?", (report_id, user["id"])
        ).fetchone()
        if report is None:
            raise HTTPException(404, "Report not found")
        if report["status"] != "pending":
            raise HTTPException(409, "Report has already been reviewed")
        db.execute(
            """INSERT INTO report_evidence VALUES (?, ?, ?)
               ON CONFLICT(report_id) DO UPDATE SET
               evidence = excluded.evidence, evidence_type = excluded.evidence_type""",
            (report_id, content, content_type),
        )


@router.get("/review/reports/{report_id}/evidence", dependencies=[Depends(reviewer)],
            response_class=Response, responses={200: {"content": {"image/png": {}, "image/jpeg": {}}}})
def report_evidence(report_id: int):
    with connect() as db:
        row = db.execute(
            "SELECT evidence, evidence_type FROM report_evidence WHERE report_id = ?", (report_id,)
        ).fetchone()
    return image_response(row)



def reports(status, limit, offset):
    with connect() as db:
        rows = db.execute(
            """SELECT r.id, d.slug, r.description, r.observed_on, r.status, r.reviewed_at,
                      EXISTS (SELECT 1 FROM report_evidence WHERE report_id = r.id) AS has_evidence
               FROM reports r JOIN destinations d ON d.id = r.destination_id
               WHERE r.status = ? ORDER BY r.id LIMIT ? OFFSET ?""",
            (status, limit, offset),
        ).fetchall()
    return [dict(row) for row in rows]


@router.get("/review/reports", dependencies=[Depends(reviewer)])
def pending_reports(limit: PageSize = 20, offset: Offset = 0):
    return reports("pending", limit, offset)


@router.patch("/review/reports/{report_id}")
def review_report(report_id: int, data: ReportDecision, user=Depends(reviewer)):
    return moderate("report", report_id, data.status, user)


@router.get("/curation/reports", dependencies=[Depends(curator)])
def confirmed_reports(limit: PageSize = 20, offset: Offset = 0):
    return reports("confirmed", limit, offset)
