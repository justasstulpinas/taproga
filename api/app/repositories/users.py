import uuid

from sqlalchemy import Select, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import NewlywedProfile, ServiceProfile, User
from app.pagination import Cursor, Page, PageRequest

_LIKE_ESCAPE = "\\"


def _escape_like(value: str) -> str:
    return (
        value.replace(_LIKE_ESCAPE, _LIKE_ESCAPE * 2)
        .replace("%", f"{_LIKE_ESCAPE}%")
        .replace("_", f"{_LIKE_ESCAPE}_")
    )


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def _active(self) -> Select[User]:
        return select(User).where(User.deleted_at.is_(None))

    async def get_by_email(self, email: str) -> User | None:
        result = await self._session.execute(self._active().where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: int) -> User | None:
        result = await self._session.execute(self._active().where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_with_profiles(self, public_id: uuid.UUID) -> User | None:
        result = await self._session.execute(
            self._active()
            .where(User.public_id == public_id)
            .options(selectinload(User.newlywed_profile), selectinload(User.service_profile))
        )
        return result.scalar_one_or_none()

    async def load_profiles(self, user: User) -> None:
        await self._session.refresh(user, ["newlywed_profile", "service_profile"])

    def add(self, user: User) -> None:
        self._session.add(user)

    def add_profile(self, profile: NewlywedProfile | ServiceProfile) -> None:
        self._session.add(profile)

    async def search(self, email_query: str | None, page: PageRequest) -> Page[User]:
        stmt = self._active().order_by(User.created_at.desc(), User.public_id.desc())
        if email_query:
            stmt = stmt.where(
                User.email.like(f"%{_escape_like(email_query.lower())}%", escape=_LIKE_ESCAPE)
            )
        if page.after is not None:
            stmt = stmt.where(
                tuple_(User.created_at, User.public_id)
                < tuple_(page.after.created_at, page.after.public_id)
            )
        rows = list((await self._session.execute(stmt.limit(page.limit + 1))).scalars())
        has_more = len(rows) > page.limit
        items = rows[: page.limit]
        next_cursor = (
            Cursor(items[-1].created_at, items[-1].public_id) if has_more and items else None
        )
        return Page(items=items, next_cursor=next_cursor)
