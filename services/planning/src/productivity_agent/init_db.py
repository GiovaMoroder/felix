from productivity_agent.infrastructure.db.base import create_schema, database_location


def main() -> None:
    create_schema()
    print(f"Initialized local database at {database_location()}")
