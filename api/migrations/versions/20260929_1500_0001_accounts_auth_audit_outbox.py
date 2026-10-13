"""accounts, auth, audit log, email outbox

Revision ID: 0001
Revises:
Create Date: 2026-09-29 15:00:00+00:00

"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies of the values at the time of this migration; never import app code here.
ACCOUNT_TYPES = ("newlywed", "service", "superadmin")
LOCALES = ("lt", "en")
TOKEN_PURPOSES = ("verify_email", "password_reset")
ACTOR_KINDS = ("user", "superadmin", "guest", "system", "anonymous")
OUTBOX_STATUSES = ("pending", "sent", "dead")


def _tstz(name: str, *, nullable: bool = False) -> sa.Column[Any]:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def _enum(name: str) -> sa.Column[Any]:
    return sa.Column(name, sa.String(32), nullable=False)


def _one_of(table: str, column: str, constraint: str, values: Sequence[str]) -> sa.CheckConstraint:
    allowed = ", ".join(f"'{value}'" for value in values)
    return sa.CheckConstraint(f"{column} IN ({allowed})", name=op.f(f"ck_{table}_{constraint}"))


def _json(name: str) -> sa.Column[Any]:
    return sa.Column(name, sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=True)


def _bigint_pk() -> sa.Column[Any]:
    return sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True)


APPEND_ONLY_FUNCTION = """
CREATE FUNCTION audit_log_reject_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
"""
APPEND_ONLY_TRIGGER = """
CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_log
FOR EACH STATEMENT EXECUTE FUNCTION audit_log_reject_mutation();
"""


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        _enum("account_type"),
        _enum("locale"),
        _tstz("email_verified_at", nullable=True),
        _tstz("password_changed_at"),
        sa.Column("totp_secret_encrypted", sa.String(512), nullable=True),
        sa.Column("totp_last_used_step", sa.Integer(), nullable=True),
        _tstz("deleted_at", nullable=True),
        _tstz("created_at"),
        _tstz("updated_at"),
        sa.UniqueConstraint("public_id", name=op.f("uq_users_public_id")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        _one_of("users", "account_type", "account_type", ACCOUNT_TYPES),
        _one_of("users", "locale", "locale", LOCALES),
    )

    op.create_table(
        "newlywed_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", name=op.f("fk_newlywed_profiles_user_id_users")),
            nullable=False,
        ),
        sa.Column("display_name", sa.String(120), nullable=True),
        sa.Column("phone", sa.String(40), nullable=True),
        _tstz("created_at"),
        _tstz("updated_at"),
        sa.UniqueConstraint("user_id", name=op.f("uq_newlywed_profiles_user_id")),
    )

    op.create_table(
        "service_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", name=op.f("fk_service_profiles_user_id_users")),
            nullable=False,
        ),
        sa.Column("business_name", sa.String(160), nullable=False),
        sa.Column("contact_name", sa.String(120), nullable=True),
        sa.Column("phone", sa.String(40), nullable=True),
        sa.Column("website", sa.String(300), nullable=True),
        sa.Column("instagram", sa.String(100), nullable=True),
        _tstz("created_at"),
        _tstz("updated_at"),
        sa.UniqueConstraint("user_id", name=op.f("uq_service_profiles_user_id")),
    )

    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", name=op.f("fk_user_sessions_user_id_users")),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        _tstz("created_at"),
        _tstz("last_seen_at"),
        _tstz("expires_at"),
        _tstz("revoked_at", nullable=True),
        _tstz("mfa_verified_at", nullable=True),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.UniqueConstraint("token_hash", name=op.f("uq_user_sessions_token_hash")),
    )
    op.create_index(op.f("ix_user_sessions_user_id"), "user_sessions", ["user_id"])

    op.create_table(
        "auth_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", name=op.f("fk_auth_tokens_user_id_users")),
            nullable=False,
        ),
        _enum("purpose"),
        sa.Column("token_hash", sa.String(64), nullable=False),
        _tstz("created_at"),
        _tstz("expires_at"),
        _tstz("used_at", nullable=True),
        sa.UniqueConstraint("token_hash", name=op.f("uq_auth_tokens_token_hash")),
        _one_of("auth_tokens", "purpose", "token_purpose", TOKEN_PURPOSES),
    )
    op.create_index(op.f("ix_auth_tokens_user_id"), "auth_tokens", ["user_id"])

    op.create_table(
        "throttle_events",
        _bigint_pk(),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("subject", sa.String(64), nullable=False),
        _tstz("created_at"),
    )
    op.create_index(
        "ix_throttle_events_lookup", "throttle_events", ["action", "subject", "created_at"]
    )

    op.create_table(
        "audit_log",
        _bigint_pk(),
        sa.Column("public_id", sa.Uuid(), nullable=False),
        _tstz("created_at"),
        _enum("actor_kind"),
        sa.Column(
            "actor_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", name=op.f("fk_audit_log_actor_user_id_users")),
            nullable=True,
        ),
        sa.Column("action", sa.String(60), nullable=False),
        sa.Column("target_type", sa.String(40), nullable=True),
        sa.Column("target_public_id", sa.Uuid(), nullable=True),
        _json("before"),
        _json("after"),
        _json("context"),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.UniqueConstraint("public_id", name=op.f("uq_audit_log_public_id")),
        _one_of("audit_log", "actor_kind", "actor_kind", ACTOR_KINDS),
    )
    op.create_index(op.f("ix_audit_log_created_at"), "audit_log", ["created_at"])
    op.create_index(op.f("ix_audit_log_actor_user_id"), "audit_log", ["actor_user_id"])
    op.create_index(op.f("ix_audit_log_action"), "audit_log", ["action"])
    op.create_index(op.f("ix_audit_log_target_public_id"), "audit_log", ["target_public_id"])

    op.create_table(
        "email_outbox",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("to_address", sa.String(320), nullable=False),
        sa.Column("template", sa.String(60), nullable=False),
        _enum("locale"),
        _json("payload"),
        _enum("status"),
        sa.Column("attempts", sa.Integer(), nullable=False),
        _tstz("next_attempt_at"),
        sa.Column("last_error", sa.String(500), nullable=True),
        _tstz("sent_at", nullable=True),
        _tstz("created_at"),
        _tstz("updated_at"),
        _one_of("email_outbox", "locale", "locale", LOCALES),
        _one_of("email_outbox", "status", "outbox_status", OUTBOX_STATUSES),
    )
    op.create_index("ix_email_outbox_due", "email_outbox", ["status", "next_attempt_at"])

    if op.get_bind().dialect.name == "postgresql":
        op.execute(APPEND_ONLY_FUNCTION)
        op.execute(APPEND_ONLY_TRIGGER)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log")
        op.execute("DROP FUNCTION IF EXISTS audit_log_reject_mutation()")
    op.drop_table("email_outbox")
    op.drop_table("audit_log")
    op.drop_table("throttle_events")
    op.drop_table("auth_tokens")
    op.drop_table("user_sessions")
    op.drop_table("service_profiles")
    op.drop_table("newlywed_profiles")
    op.drop_table("users")
