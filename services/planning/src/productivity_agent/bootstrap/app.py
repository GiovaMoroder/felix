from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from productivity_agent.infrastructure.db.base import create_schema
from productivity_agent.interfaces.api.events import router as events_router


def create_app() -> FastAPI:
    app = FastAPI(title="Productivity Agent Planning Service")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def startup() -> None:
        create_schema()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(events_router, prefix="/api")
    return app
