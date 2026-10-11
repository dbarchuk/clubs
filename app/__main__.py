import uvicorn

from app.core.config import settings
from app.core.logging import configure_logging


def main() -> None:
    configure_logging(settings.log_level)
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=settings.port,
        log_level=settings.log_level.lower(),
        reload=settings.debug,
    )


if __name__ == "__main__":
    main()