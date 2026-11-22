from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import FastAPI
from pydantic import BaseModel, StringConstraints

from . import catalog, feedback
from .auth import jwt_secret, login
from .db import connect, init_db


@asynccontextmanager
async def lifespan(app):
    jwt_secret()
    init_db()
    yield


app = FastAPI(
    title="Senandika Sunyi",
    description="Curated destinations and visitor feedback in Bali.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)


class LoginInput(BaseModel):
    username: Annotated[str, StringConstraints(min_length=3, max_length=64)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class Token(BaseModel):
    access_token: str
    token_type: Literal["bearer"]
    role: Literal["visitor", "curator", "reviewer"]


@app.get("/api/health", tags=["Service"])
def health():
    with connect() as db:
        db.execute("SELECT 1 FROM destinations LIMIT 1")
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=Token, tags=["Service"])
def sign_in(data: LoginInput):
    return login(data.username, data.password)


app.include_router(catalog.router, prefix="/api")
app.include_router(feedback.router, prefix="/api")
