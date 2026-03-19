import os
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

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
    from productivity_agent.infrastructure.db.models import AreaRecord, EventRecord, ProjectRecord, TaskRecord

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()
    _seed_work_demo_data()


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


def _seed_work_demo_data() -> None:
    from datetime import date, datetime, timedelta, timezone

    from productivity_agent.infrastructure.db.models import AreaRecord, ProjectRecord, TaskRecord

    session = SessionLocal()
    try:
        if session.query(AreaRecord).count() > 0:
            return

        now = datetime.now(timezone.utc)
        today = now.date()

        areas = [
            AreaRecord(id="career", name="Career"),
            AreaRecord(id="health", name="Health"),
            AreaRecord(id="life", name="Life"),
        ]
        session.add_all(areas)

        projects = [
            ProjectRecord(
                id="career-interview-loop",
                area_id="career",
                name="Interview Prep",
                priority="high",
                status="active",
                soft_deadline=today + timedelta(days=15),
            ),
            ProjectRecord(
                id="career-writing",
                area_id="career",
                name="Writing System",
                priority="medium",
                status="active",
                soft_deadline=today + timedelta(days=28),
            ),
            ProjectRecord(
                id="health-strength",
                area_id="health",
                name="Strength Reset",
                priority="low",
                status="active",
            ),
            ProjectRecord(
                id="life-admin",
                area_id="life",
                name="Home Admin Reset",
                priority="medium",
                status="parked",
            ),
        ]
        session.add_all(projects)

        tasks = [
            _seed_task(
                project_id="career-interview-loop",
                name="Practice system design story",
                estimate_minutes=90,
                status="scheduled",
                scheduled_start=_next_slot(now, days=1, hour=9),
            ),
            _seed_task(
                project_id="career-interview-loop",
                name="Run mock interview with scorecard",
                estimate_minutes=60,
                status="todo",
            ),
            _seed_task(
                project_id="career-interview-loop",
                name="Rewrite behavioral answers",
                estimate_minutes=45,
                status="overdue",
            ),
            _seed_task(
                project_id="career-interview-loop",
                name="Read company brief and notes",
                estimate_minutes=30,
                status="done",
                completed_at=now - timedelta(days=1),
            ),
            _seed_task(
                project_id="career-writing",
                name="Outline essay #3",
                estimate_minutes=40,
                status="scheduled",
                scheduled_start=_next_slot(now, days=2, hour=12, minute=30),
            ),
            _seed_task(
                project_id="career-writing",
                name="Edit previous draft",
                estimate_minutes=35,
                status="todo",
            ),
            _seed_task(
                project_id="career-writing",
                name="Publish and share notes",
                estimate_minutes=20,
                status="done",
                completed_at=now,
            ),
            _seed_task(
                project_id="health-strength",
                name="Gym session A",
                estimate_minutes=50,
                status="todo",
            ),
            _seed_task(
                project_id="health-strength",
                name="Gym session B",
                estimate_minutes=50,
                status="todo",
            ),
            _seed_task(
                project_id="health-strength",
                name="Mobility reset",
                estimate_minutes=20,
                status="done",
                completed_at=now - timedelta(days=6),
            ),
            _seed_task(
                project_id="life-admin",
                name="Review recurring bills",
                estimate_minutes=25,
                status="todo",
            ),
            _seed_task(
                project_id="life-admin",
                name="Organize insurance docs",
                estimate_minutes=30,
                status="done",
                completed_at=now - timedelta(days=11),
            ),
        ]
        session.add_all(tasks)
        session.commit()
    finally:
        session.close()


def _seed_task(
    *,
    project_id: str,
    name: str,
    estimate_minutes: int,
    status: str,
    scheduled_start=None,
    completed_at=None,
):
    from productivity_agent.infrastructure.db.models import TaskRecord

    return TaskRecord(
        id=str(uuid4()),
        project_id=project_id,
        name=name,
        estimate_minutes=estimate_minutes,
        status=status,
        scheduled_start=scheduled_start,
        completed_at=completed_at,
    )


def _next_slot(now, *, days: int, hour: int, minute: int = 0):
    target = now + timedelta(days=days)
    return target.replace(hour=hour, minute=minute, second=0, microsecond=0)
