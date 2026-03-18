from datetime import datetime

import pytest

from productivity_agent.domain.calendar.value_objects.time_range import TimeRange


def test_time_range_requires_end_after_start() -> None:
    with pytest.raises(ValueError):
        TimeRange(
            start=datetime(2026, 3, 18, 10, 0),
            end=datetime(2026, 3, 18, 9, 0),
        )
