from logging.config import fileConfig

from alembic import context
from alembic.operations.ops import MigrationScript
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, pool

from app.core.config import settings
from app.core.database import Base
from migrations.naming import next_revision_id
from app.backend.clubs.models import * # noqa: F403, F401
from app.backend.board_games.models import * # noqa: F403, F401
from app.backend.books.models import * # noqa: F403, F401
from app.backend.events.models import * # noqa: F403, F401
from app.backend.movies.models import * # noqa: F403, F401
from app.backend.reviews.models import * # noqa: F403, F401
from app.backend.users.models import * # noqa: F403, F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def assign_sequential_revision_id(
    _: MigrationContext,
    revision: tuple[str, ...] | None,
    directives: list[MigrationScript],
) -> None:
    """Assign the next zero-padded numeric ID to a new migration."""
    del revision
    if not directives:
        return

    directives[0].rev_id = next_revision_id(ScriptDirectory.from_config(config))


def run_migrations_offline() -> None:
    """Run migrations without creating an Engine or DBAPI connection."""
    context.configure(
        url=settings.migration_database_url.render_as_string(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        process_revision_directives=assign_sequential_revision_id,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations using a synchronous SQLAlchemy connection."""
    connectable = create_engine(
        settings.migration_database_url,
        poolclass=pool.NullPool,
        connect_args={"prepare_threshold": None},
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            process_revision_directives=assign_sequential_revision_id,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
