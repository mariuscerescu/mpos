"""create queue items table

Revision ID: 0001_create_queue_items
Revises: 
Create Date: 2025-10-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "0001_create_queue_items"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS broker")
    op.create_table(
        "queue_items",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("topic", sa.String(length=64), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("available_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("claimed_until", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        schema="broker",
    )
    op.create_index("ix_queue_items_topic_status", "queue_items", ["topic", "status"], schema="broker")


def downgrade() -> None:
    op.drop_index("ix_queue_items_topic_status", table_name="queue_items", schema="broker")
    op.drop_table("queue_items", schema="broker")
