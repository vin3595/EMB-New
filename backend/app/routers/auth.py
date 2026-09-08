from fastapi import APIRouter, Depends, Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.auth import SESSION_COOKIE, create_jwt, exchange_emergent_session, get_current_user, upsert_user
from app.config import get_settings
from app.database import get_database

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


class SessionExchangeRequest(BaseModel):
    session_id: str


@router.post("/session")
async def exchange_session(
    body: SessionExchangeRequest,
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    profile = await exchange_emergent_session(body.session_id)
    user = await upsert_user(db, profile)
    token = create_jwt(user)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=settings.session_ttl_days * 24 * 3600,
        path="/",
    )
    return {"user": _public_user(user)}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": _public_user(user)}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user.get("name"),
        "picture": user.get("picture"),
        "role": user.get("role", "owner"),
    }
