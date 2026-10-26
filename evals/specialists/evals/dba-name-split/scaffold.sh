#!/usr/bin/env bash
# Eval scaffold: a small Flask + SQLAlchemy + Alembic repo whose users.name column several readers use.
set -euo pipefail
mkdir -p app migrations/versions jobs tests
cat > README.md <<'J'
# accounts-service

Flask API on PostgreSQL 15 (primary + 2 read replicas, PgBouncer in transaction mode).
`users` has about 80 million rows and takes steady write traffic (signups, profile edits).
Deploys are rolling: old and new app versions serve traffic side by side for up to 20 minutes.
Migrations run with `alembic upgrade head` as a pre-deploy step.
J
cat > alembic.ini <<'J'
[alembic]
script_location = migrations
sqlalchemy.url = postgresql://app@db.internal/accounts
J
cat > migrations/env.py <<'J'
from alembic import context
from sqlalchemy import engine_from_config, pool
config = context.config
def run_migrations_online():
    connectable = engine_from_config(config.get_section(config.config_ini_section), prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()
run_migrations_online()
J
cat > migrations/versions/0001_create_users.py <<'J'
"""create users"""
from alembic import op
import sqlalchemy as sa
revision = "0001"
down_revision = None

def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("email", sa.Text, nullable=False, unique=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

def downgrade():
    op.drop_table("users")
J
cat > migrations/versions/0002_users_created_at_index.py <<'J'
"""index users.created_at"""
from alembic import op
revision = "0002"
down_revision = "0001"

def upgrade():
    op.create_index("ix_users_created_at", "users", ["created_at"])

def downgrade():
    op.drop_index("ix_users_created_at", table_name="users")
J
touch app/__init__.py
cat > app/models.py <<'J'
from sqlalchemy import BigInteger, Text, DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
J
cat > app/routes.py <<'J'
from flask import Blueprint, jsonify, request
from sqlalchemy import select, text
from .models import User
from .db import session

bp = Blueprint("users", __name__)

@bp.post("/signup")
def signup():
    body = request.get_json()
    user = User(email=body["email"], name=body["name"].strip())
    session.add(user)
    session.commit()
    return jsonify(id=user.id, name=user.name), 201

@bp.patch("/users/<int:user_id>")
def rename(user_id):
    user = session.get(User, user_id)
    user.name = request.get_json()["name"].strip()
    session.commit()
    return jsonify(id=user.id, name=user.name)

@bp.get("/users/search")
def search():
    q = request.args["q"]
    rows = session.execute(select(User).where(User.name.ilike(f"%{q}%")).limit(20)).scalars()
    return jsonify([{"id": u.id, "name": u.name} for u in rows])

@bp.get("/reports/users-by-initial")
def by_initial():
    rows = session.execute(text("SELECT upper(left(name, 1)) AS initial, count(*) FROM users GROUP BY 1 ORDER BY 1")).all()
    return jsonify([{"initial": r[0], "count": r[1]} for r in rows])
J
cat > app/db.py <<'J'
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker
engine = create_engine("postgresql://app@db.internal/accounts")
session = scoped_session(sessionmaker(bind=engine))
J
cat > jobs/welcome_email.py <<'J'
"""Nightly job: sends the welcome email to users created in the last day."""
from app.db import session
from sqlalchemy import text

def run(send):
    rows = session.execute(text("SELECT email, name FROM users WHERE created_at > now() - interval '1 day'")).all()
    for email, name in rows:
        send(email, subject=f"Welcome, {name}")
J
cat > jobs/export_to_warehouse.py <<'J'
"""Hourly export to the analytics warehouse; the warehouse schema expects a single `name` field."""
from app.db import session
from sqlalchemy import text

def run(write_csv):
    rows = session.execute(text("SELECT id, name, created_at FROM users WHERE created_at > now() - interval '1 hour'")).all()
    write_csv("users.csv", rows)
J
cat > tests/test_users.py <<'J'
def test_placeholder():
    assert True
J
git init -q && git add -A && git -c user.email=e@x -c user.name=e commit -qm init
