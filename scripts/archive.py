"""Package only known game sources, audit evidence, and the standalone release."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import os

root = Path(__file__).resolve().parent.parent
paths = [root / name for name in ("README.md", "CONTRACT.md", "AUDIT_REPORT.md", "package.json", ".gitignore")]
allowed = {".js", ".mjs", ".json", ".html", ".css", ".txt", ".png", ".py", ".md", ".diff"}
for directory in ("dist", "tests", "scripts", "audit"):
    paths.extend(path for path in (root / directory).rglob("*") if path.is_file() and path.suffix in allowed and "__pycache__" not in path.parts)
paths.append(root / "release" / "Abduction-Midnight-Harvest.html")
output = root / "release" / "Abduction-Midnight-Harvest-source.zip"
temporary = output.with_suffix(".zip.tmp")
with ZipFile(temporary, "w", ZIP_DEFLATED) as archive:
    for path in sorted(set(paths)):
        archive.write(path, "abduction-game/" + str(path.relative_to(root)))
with ZipFile(temporary) as archive:
    failed = archive.testzip()
    if failed:
        raise RuntimeError("Archive verification failed: " + failed)
os.replace(temporary, output)
print(f"Verified source archive: {output} ({output.stat().st_size:,} bytes)")
