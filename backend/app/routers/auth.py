from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.auth import (
    SESSION_COOKIE,
    build_google_auth_url,
    create_jwt,
    exchange_google_code,
    get_current_user,
    upsert_user,
)
from app.config import get_settings
from app.database import get_database

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


@router.get("/google/login")
async def google_login():
    if not settings.google_client_id or not settings.google_redirect_uri:
        raise HTTPException(status_code=500, detail="Google OAuth is not configured on this server")
    return RedirectResponse(build_google_auth_url())


@router.get("/google/callback")
async def google_callback(code: str, db: AsyncIOMotorDatabase = Depends(get_database)):
    profile = await exchange_google_code(code)
    user = await upsert_user(db, profile)
    token = create_jwt(user)

    # Frontend and backend live on different subdomains, so a cookie set here would be a
    # third-party cookie on every later API call and gets silently blocked by modern browsers.
    # Hand the JWT back in the URL fragment instead — it never reaches the server in a Referer
    # or access log — and the frontend stores it to send as a Bearer token from then on.
    response = RedirectResponse(f"{settings.frontend_url}/#auth_token={token}")
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=settings.session_ttl_days * 24 * 3600,
        path="/",
    )
    return response


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
