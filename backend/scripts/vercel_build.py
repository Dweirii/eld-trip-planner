"""Vercel build hook: apply database migrations on production deploys only.

Preview deploys skip this, so they never alter the production database.
"""

import os
import sys
from pathlib import Path


def main() -> None:
    if os.environ.get("VERCEL_ENV") != "production":
        print("Skipping migrations (not a production deploy).")
        return
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django
    from django.core.management import call_command

    django.setup()
    call_command("migrate", interactive=False)


if __name__ == "__main__":
    main()
