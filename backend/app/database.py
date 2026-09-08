import re

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.config import get_settings

_settings = get_settings()
_client: AsyncIOMotorClient = AsyncIOMotorClient(_settings.mongo_url)
db: AsyncIOMotorDatabase = _client[_settings.db_name]


def sanitize_email(email: str) -> str:
    """Lowercase and replace every non-alphanumeric char with '_' for use as a collection-prefix key."""
    return re.sub(r"[^a-z0-9]", "_", email.strip().lower())


class TenantDB:
    """Wraps the shared Mongo database and transparently prefixes every collection
    name with t_{sanitized_owner_email}_ so tenants never share a collection.
    """

    def __init__(self, database: AsyncIOMotorDatabase, owner_email: str):
        self._db = database
        self.owner_email = owner_email
        self.prefix = f"t_{sanitize_email(owner_email)}_"

    def __getitem__(self, name: str) -> AsyncIOMotorCollection:
        return self._db[f"{self.prefix}{name}"]

    def __getattr__(self, name: str) -> AsyncIOMotorCollection:
        return self[name]


def tenant_db(database: AsyncIOMotorDatabase, user: dict) -> TenantDB:
    """Build the isolated per-tenant view for the given authenticated user.

    `user` must carry an "owner_email" (or "email") field identifying the tenant.
    Staff/sub-accounts always resolve to their owning shop's email, never their own.
    """
    owner_email = user.get("owner_email") or user["email"]
    return TenantDB(database, owner_email)


async def get_database() -> AsyncIOMotorDatabase:
    return db
