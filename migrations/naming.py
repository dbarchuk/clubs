from alembic.script import ScriptDirectory


def next_revision_id(script_directory: ScriptDirectory) -> str:
    """Return the next five-digit numeric ID in the migration history."""
    existing_ids = (
        int(script.revision)
        for script in script_directory.walk_revisions()
        if script.revision.isdecimal()
    )
    return f"{max(existing_ids, default=0) + 1:06d}"
