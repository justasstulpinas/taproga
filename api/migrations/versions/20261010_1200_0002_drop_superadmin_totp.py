"""drop superadmin TOTP columns

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-10 12:00:00+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("totp_secret_encrypted")
        batch.drop_column("totp_last_used_step")
    with op.batch_alter_table("user_sessions") as batch:
        batch.drop_column("mfa_verified_at")


def downgrade() -> None:
    with op.batch_alter_table("user_sessions") as batch:
        batch.add_column(sa.Column("mfa_verified_at", sa.DateTime(timezone=True), nullable=True))
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("totp_secret_encrypted", sa.Text(), nullable=True))
        batch.add_column(sa.Column("totp_last_used_step", sa.BigInteger(), nullable=True))
