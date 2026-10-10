import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import Meta, Superadmin, get_admin_service, require_superadmin
from app.routers.common import PageParams
from app.schemas.admin import AdminUserDetailOut, AdminUserOut, AuditEntryOut
from app.schemas.auth import AcceptedOut
from app.schemas.common import PageOut
from app.services.admin import AdminService

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_superadmin)])

Admin = Annotated[AdminService, Depends(get_admin_service)]
EMAIL_QUERY_MAX_LENGTH = 100


@router.get("/users")
async def list_users(
    admin: Admin,
    page: PageParams,
    q: Annotated[str | None, Query(max_length=EMAIL_QUERY_MAX_LENGTH)] = None,
) -> PageOut[AdminUserOut]:
    result = await admin.list_users(q, page)
    return PageOut(
        items=[AdminUserOut.build(user) for user in result.items],
        next_cursor=result.next_cursor.encode() if result.next_cursor else None,
    )


@router.get("/users/{user_id}")
async def get_user(user_id: uuid.UUID, admin: Admin) -> AdminUserDetailOut:
    return AdminUserDetailOut.build(await admin.get_user(user_id))


@router.post("/users/{user_id}/verify-email")
async def force_verify_email(
    user_id: uuid.UUID, admin: Admin, ctx: Superadmin, meta: Meta
) -> AdminUserDetailOut:
    return AdminUserDetailOut.build(await admin.force_verify_email(ctx, user_id, meta))


@router.post("/users/{user_id}/password-reset", status_code=status.HTTP_202_ACCEPTED)
async def trigger_password_reset(
    user_id: uuid.UUID, admin: Admin, ctx: Superadmin, meta: Meta
) -> AcceptedOut:
    await admin.trigger_password_reset(ctx, user_id, meta)
    return AcceptedOut()


@router.post("/users/{user_id}/unlock", status_code=status.HTTP_204_NO_CONTENT)
async def unlock_account(user_id: uuid.UUID, admin: Admin, ctx: Superadmin, meta: Meta) -> None:
    await admin.unlock_account(ctx, user_id, meta)


@router.get("/audit-log")
async def list_audit_log(admin: Admin, page: PageParams) -> PageOut[AuditEntryOut]:
    result = await admin.list_audit_log(page)
    return PageOut(
        items=[AuditEntryOut.build(entry, actor) for entry, actor in result.items],
        next_cursor=result.next_cursor.encode() if result.next_cursor else None,
    )
