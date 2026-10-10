"""vaises blocked dates and requests

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-10 13:00:00+00:00

"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies of the values at the time of this migration; never import app code here.
REQUEST_KINDS = ("date_inquiry", "consultation")
AVAILABILITIES = ("available", "reserved")
CONTACT_KINDS = ("email", "phone")
REQUEST_STATUSES = ("new", "handled")
LOCALES = ("lt", "en")


def _tstz(name: str, *, nullable: bool = False) -> sa.Column[Any]:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def _enum(name: str, *, nullable: bool = False) -> sa.Column[Any]:
    return sa.Column(name, sa.String(32), nullable=nullable)


def _one_of(table: str, column: str, constraint: str, values: Sequence[str]) -> sa.CheckConstraint:
    allowed = ", ".join(f"'{value}'" for value in values)
    return sa.CheckConstraint(f"{column} IN ({allowed})", name=op.f(f"ck_{table}_{constraint}"))


def upgrade() -> None:
    op.create_table(
        "vaises_blocked_dates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey(
                "users.id", name=op.f("fk_vaises_blocked_dates_created_by_user_id_users")
            ),
            nullable=False,
        ),
        _tstz("created_at"),
        _tstz("updated_at"),
        sa.UniqueConstraint("public_id", name=op.f("uq_vaises_blocked_dates_public_id")),
        sa.UniqueConstraint("date", name=op.f("uq_vaises_blocked_dates_date")),
    )
    op.create_index(
        op.f("ix_vaises_blocked_dates_created_by_user_id"),
        "vaises_blocked_dates",
        ["created_by_user_id"],
    )

    op.create_table(
        "vaises_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.Uuid(), nullable=False),
        _enum("kind"),
        sa.Column("event_date", sa.Date(), nullable=True),
        _enum("availability_at_submit", nullable=True),
        _enum("contact_kind", nullable=True),
        sa.Column("contact_encrypted", sa.Text(), nullable=True),
        sa.Column("contact_hash", sa.String(64), nullable=True),
        _enum("locale"),
        sa.Column("idempotency_key", sa.Uuid(), nullable=False),
        _enum("status"),
        _tstz("handled_at", nullable=True),
        sa.Column(
            "handled_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", name=op.f("fk_vaises_requests_handled_by_user_id_users")),
            nullable=True,
        ),
        _tstz("anonymised_at", nullable=True),
        _tstz("deleted_at", nullable=True),
        _tstz("created_at"),
        _tstz("updated_at"),
        sa.UniqueConstraint("public_id", name=op.f("uq_vaises_requests_public_id")),
        sa.UniqueConstraint("idempotency_key", name=op.f("uq_vaises_requests_idempotency_key")),
        _one_of("vaises_requests", "kind", "request_kind", REQUEST_KINDS),
        _one_of("vaises_requests", "availability_at_submit", "availability", AVAILABILITIES),
        _one_of("vaises_requests", "contact_kind", "contact_kind", CONTACT_KINDS),
        _one_of("vaises_requests", "locale", "locale", LOCALES),
        _one_of("vaises_requests", "status", "request_status", REQUEST_STATUSES),
        sa.CheckConstraint(
            "(kind = 'date_inquiry' AND event_date IS NOT NULL)"
            " OR (kind = 'consultation' AND event_date IS NULL)",
            name=op.f("ck_vaises_requests_event_date_matches_kind"),
        ),
    )
    op.create_index(op.f("ix_vaises_requests_contact_hash"), "vaises_requests", ["contact_hash"])
    op.create_index(op.f("ix_vaises_requests_status"), "vaises_requests", ["status"])
    op.create_index(
        op.f("ix_vaises_requests_handled_by_user_id"), "vaises_requests", ["handled_by_user_id"]
    )
    op.create_index(op.f("ix_vaises_requests_created_at"), "vaises_requests", ["created_at"])


def downgrade() -> None:
    op.drop_table("vaises_requests")
    op.drop_table("vaises_blocked_dates")
