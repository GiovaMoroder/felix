from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from productivity_agent.infrastructure.db.base import Base


class EventRecord(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    start_at: Mapped[str] = mapped_column(String(64), index=True)
    end_at: Mapped[str] = mapped_column(String(64), index=True)
    notes: Mapped[str | None] = mapped_column(Text(), nullable=True)
    all_day: Mapped[bool] = mapped_column(Boolean(), default=False)


class AreaRecord(Base):
    __tablename__ = "areas"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)

    projects: Mapped[list["ProjectRecord"]] = relationship(
        back_populates="area",
        cascade="all, delete-orphan",
    )


class ProjectRecord(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    area_id: Mapped[str] = mapped_column(ForeignKey("areas.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    priority: Mapped[str] = mapped_column(String(32), default="medium")
    status: Mapped[str] = mapped_column(String(32), default="active")
    soft_deadline: Mapped[date | None] = mapped_column(Date(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    area: Mapped[AreaRecord] = relationship(back_populates="projects")
    tasks: Mapped[list["TaskRecord"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )


class TaskRecord(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    estimate_minutes: Mapped[int] = mapped_column(Integer(), default=30)
    status: Mapped[str] = mapped_column(String(32), default="todo")
    linked_event_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    scheduled_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    project: Mapped[ProjectRecord] = relationship(back_populates="tasks")
