"""vaises request service and message

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-12 12:00:00+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copy of the values at the time of this migration; never import app code here.
SERVICES = ("uzkandziai", "renginiai", "vestuves")


def upgrade() -> None:
    with op.batch_alter_table("vaises_requests") as batch:
        batch.add_column(sa.Column("service", sa.String(32), nullable=True))

    # Vestuvės was the only service with a date flow before this migration.
    op.execute("UPDATE vaises_requests SET service = 'vestuves' WHERE kind = 'date_inquiry'")

    allowed = ", ".join(f"'{value}'" for value in SERVICES)
    with op.batch_alter_table("vaises_requests") as batch:
        batch.add_column(sa.Column("message_encrypted", sa.Text(), nullable=True))
        batch.create_index(op.f("ix_vaises_requests_service"), ["service"])
        batch.create_check_constraint(op.f("ck_vaises_requests_service"), f"service IN ({allowed})")
        batch.create_check_constraint(
            op.f("ck_vaises_requests_service_matches_kind"),
            "(kind = 'date_inquiry' AND service IS NOT NULL)"
            " OR (kind = 'consultation' AND service IS NULL)",
        )


def downgrade() -> None:
    with op.batch_alter_table("vaises_requests") as batch:
        batch.drop_constraint(op.f("ck_vaises_requests_service_matches_kind"), type_="check")
        batch.drop_constraint(op.f("ck_vaises_requests_service"), type_="check")
        batch.drop_index(op.f("ix_vaises_requests_service"))
        batch.drop_column("message_encrypted")
        batch.drop_column("service")
