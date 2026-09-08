from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import jwt
from fastapi import Cookie, Depends, Header, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.database import get_database

settings = get_settings()

SESSION_COOKIE = "emb_session"


def create_jwt(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "owner_email": user.get("owner_email") or user["email"],
        "role": user.get("role", "owner"),
        "iat": now,
        "exp": now + timedelta(days=settings.session_ttl_days),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session") from exc


async def exchange_emergent_session(emergent_session_id: str) -> dict:
    """Exchange a one-time Emergent OAuth session id for the Google profile.

    Returns {id, email, name, picture} as provided by the Emergent auth session-data API.
    """
    url = f"{settings.emergent_auth_base}/env/oauth/session-data"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers={"X-Session-ID": emergent_session_id})
    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not verify Google sign-in session")
    data = resp.json()
    if not data.get("email"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign-in session did not return an email")
    return data


async def upsert_user(db: AsyncIOMotorDatabase, profile: dict) -> dict:
    email = profile["email"].strip().lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": profile.get("name", existing.get("name")), "picture": profile.get("picture", existing.get("picture"))}},
        )
        existing.update({"name": profile.get("name", existing.get("name")), "picture": profile.get("picture")})
        return existing

    role = "admin" if email in settings.admin_email_list else "owner"
    user = {
        "id": str(uuid4()),
        "email": email,
        "name": profile.get("name", email.split("@")[0]),
        "picture": profile.get("picture"),
        "role": role,
        "owner_email": email,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    return user


async def get_current_user(
    db: AsyncIOMotorDatabase = Depends(get_database),
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    authorization: str | None = Header(default=None),
) -> dict:
    token = session_cookie
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_jwt(token)
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
