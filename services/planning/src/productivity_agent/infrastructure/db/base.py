import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

SERVICE_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_DATABASE_PATH = SERVICE_ROOT / "data" / "planning.db"


def database_url() -> str:
    return os.getenv("PRODUCTIVITY_AGENT_DB_URL", f"sqlite:///{DEFAULT_DATABASE_PATH}")


def database_location() -> Path | str:
    url = database_url()
    if url.startswith("sqlite:///"):
        return Path(url.removeprefix("sqlite:///"))
    return url

DEFAULT_DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    database_url(),
    future=True,
    connect_args={"check_same_thread": False} if database_url().startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def create_schema() -> None:
    from productivity_agent.infrastructure.db.models import EventRecord

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()


def _ensure_sqlite_columns() -> None:
    if not database_url().startswith("sqlite"):
        return

    inspector = inspect(engine)
    if "events" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("events")}
    with engine.begin() as connection:
        if "all_day" not in columns:
            connection.execute(
                text("ALTER TABLE events ADD COLUMN all_day BOOLEAN NOT NULL DEFAULT 0")
            )
