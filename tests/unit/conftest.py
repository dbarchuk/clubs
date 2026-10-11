import os
from collections.abc import Iterator

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")
os.environ["DEBUG"] = "false"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.backend.users.router import SupabaseUser, get_current_user
from app.core.database import Base, get_db
from app.main import app


@pytest.fixture
def database() -> Iterator[sessionmaker[Session]]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    test_session_factory = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False
    )

    def override_get_db() -> Iterator[Session]:
        with test_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield test_session_factory
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def client(database: sessionmaker[Session]) -> Iterator[TestClient]:
    del database  # Ensures the test database is initialized before each request.
    test_client = TestClient(app)
    yield test_client
    test_client.close()


@pytest.fixture
def test_session_factory(database: sessionmaker[Session]) -> sessionmaker[Session]:
    return database


@pytest.fixture
def supabase_identity() -> SupabaseUser:
    identity = SupabaseUser(
        user_id="supabase-user-123",
        email="reader@example.com",
        display_name="Reader Name",
        avatar_url="https://example.com/avatar.png",
    )
    app.dependency_overrides[get_current_user] = lambda: identity
    return identity
