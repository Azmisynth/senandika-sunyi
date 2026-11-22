import hashlib
import os
from datetime import UTC, datetime, timedelta
from threading import BoundedSemaphore

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader, HTTPBearer
from pwdlib import PasswordHash

from .db import connect

password_hash = PasswordHash.recommended()
dummy_hash = password_hash.hash("unused-password")
login_slots = BoundedSemaphore(2)
bearer = HTTPBearer(auto_error=False)
partner_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def jwt_secret():
    secret = os.environ.get("JWT_SECRET", "")
    if len(secret.encode()) < 32:
        raise RuntimeError("JWT_SECRET must contain at least 32 bytes")
    return secret


def login(username, password):
    with connect() as db:
        user = db.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
    with login_slots:
        valid = password_hash.verify(password, user["password_hash"] if user else dummy_hash)
    if user is None or not valid:
        raise HTTPException(401, "Invalid username or password")
    now = datetime.now(UTC)
    token = jwt.encode(
        {"sub": str(user["id"]), "iat": now, "exp": now + timedelta(hours=1)},
        jwt_secret(),
        algorithm="HS256",
    )
    return {"access_token": token, "token_type": "bearer", "role": user["role"]}


def current_user(credentials=Depends(bearer)):
    unauthorized = HTTPException(401, "Valid access token required", {"WWW-Authenticate": "Bearer"})
    if credentials is None:
        raise unauthorized
    try:
        claims = jwt.decode(
            credentials.credentials, jwt_secret(), algorithms=["HS256"],
            options={"require": ["sub", "iat", "exp"]},
        )
        user_id = int(claims["sub"])
    except (jwt.InvalidTokenError, ValueError):
        raise unauthorized from None

    with connect() as db:
        user = db.execute("SELECT id, role FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        raise unauthorized
    return user


def require_role(role):
    def check(user=Depends(current_user)):
        if user["role"] != role:
            raise HTTPException(403, "This action requires the " + role + " role")
        return user

    return check


def require_partner(key=Depends(partner_header)):
    if not key or len(key) > 128:
        raise HTTPException(401, "Valid X-API-Key required")
    digest = hashlib.sha256(key.encode()).hexdigest()
    with connect() as db:
        partner = db.execute(
            "SELECT name FROM partner_keys WHERE key_hash = ?", (digest,)
        ).fetchone()
    if partner is None:
        raise HTTPException(401, "Valid X-API-Key required")
