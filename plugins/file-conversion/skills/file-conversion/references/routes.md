# Example conversion routes

Adapted from the wshobson/agents file-conversion skill (MIT, Copyright (c) 2024 Seth Hobson). Each route assumes `conversion_input` and `conversion_dir` are set as in SKILL.md ("Preserve originals"). Run only the route that fits the inspected input and requested output.

**MP4 to MP3:** select the first audio stream explicitly. MP3 encoding is lossy; confirm
any different stream or quality requirement before using these settings.

```bash
ffmpeg -nostdin -n -protocol_whitelist file,pipe -i "$conversion_input" \
  -map 0:a:0 -vn -c:a libmp3lame -q:a 2 "$conversion_dir/output.mp3"
ffprobe -v error -show_entries format=format_name,duration,size:stream=codec_name,codec_type \
  -of json "$conversion_dir/output.mp3"
```

**Single PNG to JPEG:** this example composites transparency onto white and uses lossy
JPEG quality 90. Choose a different background or an alpha-capable target if needed.
Handle multi-frame inputs explicitly instead of dropping frames silently.

```bash
magick "$conversion_input" -auto-orient -background white -alpha remove -alpha off \
  -quality 90 "$conversion_dir/output.jpg"
magick identify "$conversion_dir/output.jpg"
```

**Markdown to DOCX:** structural conversion can change styling. This example uses
local assets from the input directory and assumes no remote assets.

```bash
pandoc --from=markdown --to=docx --standalone "$conversion_input" \
  --resource-path="$(dirname "$conversion_input")" \
  --output="$conversion_dir/output.docx"
```

**Office document to PDF:** use a separate profile to avoid sharing an open instance.
Python 3 encodes its file URI. A fresh profile and headless mode do not block network
access or macros; meet step 3 first. The PDF uses the input basename. Check it even
after exit 0. The subshell removes only its temporary profile on exit.

```bash
(
  conversion_profile="$(mktemp -d)" || exit 1
  trap 'rm -rf -- "$conversion_profile"' EXIT
  conversion_profile_uri="$(python3 -c \
    'import pathlib, sys; print(pathlib.Path(sys.argv[1]).resolve().as_uri())' \
    "$conversion_profile")" || exit 1
  soffice "-env:UserInstallation=$conversion_profile_uri" \
    --headless --convert-to pdf --outdir "$conversion_dir" "$conversion_input"
)
```

**Small CSV to JSON:** for UTF-8, comma-separated input with one unique header row and
equal-width rows. This keeps values as strings, including leading zeros. Confirm those
assumptions first; large files need a streaming approach and an explicit output schema.
The exclusive output mode refuses to replace a file.

```bash
python3 - "$conversion_input" "$conversion_dir/output.json" <<'PYTHON'
import csv
import json
import sys
from pathlib import Path

source, target = map(Path, sys.argv[1:])
with source.open(encoding="utf-8-sig", newline="") as stream:
    reader = csv.reader(stream, strict=True)
    headers = next(reader, [])
    if not headers or any(not key for key in headers) or len(set(headers)) != len(headers):
        raise ValueError("CSV requires unique, nonempty headers")
    rows = []
    for row in reader:
        if len(row) != len(headers):
            raise ValueError(f"CSV record ending at line {reader.line_num} has the wrong width")
        rows.append(dict(zip(headers, row)))
with target.open("x", encoding="utf-8") as stream:
    json.dump(rows, stream, ensure_ascii=False, indent=2)
    stream.write("\n")
print(f"Converted {len(rows)} rows")
PYTHON
```

