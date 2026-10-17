import logging
import re


_SENSITIVE_QUERY_PARAMETER = re.compile(
    r"([?&](?:api_key|key|access_token|token|secret)=)[^&\s]+", re.IGNORECASE
)


def log_external_error(
    logger: logging.Logger,
    message: str,
    error: Exception,
    *,
    secrets: tuple[str, ...] = (),
) -> None:
    """Log an external exception and traceback without exposing credential URLs."""
    def redact(value: str) -> str:
        for secret in secrets:
            if secret:
                value = value.replace(secret, "[REDACTED]")
        return _SENSITIVE_QUERY_PARAMETER.sub(r"\1[REDACTED]", value)

    safe_message = redact(str(error))
    logged_error = RuntimeError(f"{type(error).__name__}: {safe_message}")
    logger.error(
        "%s",
        redact(message),
        exc_info=(RuntimeError, logged_error, error.__traceback__),
    )


def configure_logging(level: str) -> None:
    """Set the application-wide log level and a useful default format."""
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    if not root_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s [%(name)s] %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        root_logger.addHandler(handler)
