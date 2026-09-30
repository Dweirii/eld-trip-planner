from io import StringIO
from pathlib import Path

from django.core.management import call_command

SCHEMA_FILE = Path(__file__).resolve().parent.parent / "openapi.yaml"


def test_committed_openapi_schema_is_up_to_date():
    out = StringIO()
    call_command("spectacular", "--validate", "--fail-on-warn", stdout=out)
    assert SCHEMA_FILE.exists(), "Run: uv run python manage.py spectacular --file openapi.yaml"
    assert SCHEMA_FILE.read_text() == out.getvalue(), (
        "openapi.yaml is stale. Run: uv run python manage.py spectacular --file openapi.yaml"
    )
