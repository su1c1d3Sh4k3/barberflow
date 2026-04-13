#!/usr/bin/env python3
"""Run all BarberFlow tests with detailed report."""
import subprocess
import sys

result = subprocess.run(
    ["python", "-m", "pytest", "tests/", "-v", "--tb=short",
     "--html=tests/report.html", "--self-contained-html",
     "-x",  # stop on first failure
     "--order=backend,api,frontend,integration"],
    cwd=".",
)
sys.exit(result.returncode)
