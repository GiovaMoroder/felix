from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from productivity_agent.infrastructure.db.base import Base


class EventRecord(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    start_at: Mapped[str] = mapped_column(String(64), index=True)
    end_at: Mapped[str] = mapped_column(String(64), index=True)
    notes: Mapped[str | None] = mapped_column(Text(), nullable=True)
    all_day: Mapped[bool] = mapped_column(Boolean(), default=False)
