#!/usr/bin/env python3
"""Extract .PAK files from Dune II CD image (2352-byte sectors) into Dynasty data dir."""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

import pycdlib

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "_vendor" / "dunedynasty" / "static" / "general" / "data"
FILELIST = DATA / "FILELIST.TXT"
ISO_IMG = DATA / "Dune 2 - ISO" / "DUNE2CD.img"
NEEDED = [
    "atre.pak", "dune.pak", "english.pak", "finale.pak", "french.pak", "german.pak",
    "hark.pak", "intro.pak", "introvoc.pak", "mentat.pak", "merc.pak", "ordos.pak",
    "scenario.pak", "sound.pak", "voc.pak",
]


def img_to_iso2048(img: bytes) -> bytes:
    sector, payload = 2352, 2048
    out = bytearray()
    for i in range(len(img) // sector):
        base = i * sector
        out.extend(img[base + 16 : base + 16 + payload])
    return bytes(out)


def parse_filelist() -> dict[str, str]:
    hashes: dict[str, str] = {}
    if not FILELIST.exists():
        return hashes
    for line in FILELIST.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([0-9a-f]{32})\s+(\S+)", line.strip())
        if m:
            hashes[m.group(2).lower()] = m.group(1)
    return hashes


def extract_paks(iso_path: Path, dest: Path) -> list[str]:
    dest.mkdir(parents=True, exist_ok=True)
    iso = pycdlib.PyCdlib()
    iso.open(str(iso_path))
    extracted: list[str] = []
    # Virgin CD-utgave: alle .PAK ligger i /VIRGIN/DUNE2
    for iso_dir in ("/VIRGIN/DUNE2", "/"):
        try:
            children = list(iso.list_children(iso_path=iso_dir))
        except Exception:
            continue
        for child in children:
            if not child.is_file():
                continue
            name = child.file_identifier().decode("ascii").split(";")[0]
            if not name.lower().endswith(".pak"):
                continue
            full = f"{iso_dir.rstrip('/')}/{child.file_identifier().decode('ascii')}"
            out = dest / name.lower()
            with iso.open_file_from_iso(iso_path=full) as f:
                out.write_bytes(f.read())
            extracted.append(name.lower())
            print(f"  {name.lower()} ({out.stat().st_size} bytes)")
    iso.close()
    return extracted


def main() -> int:
    if not ISO_IMG.exists():
        print(f"Mangler CD-bilde: {ISO_IMG}", file=sys.stderr)
        return 1

    print("Konverterer IMG (2352) til ISO (2048)...")
    raw = ISO_IMG.read_bytes()
    iso_bytes = img_to_iso2048(raw)
    tmp_iso = DATA / "_dune2.iso"
    tmp_iso.write_bytes(iso_bytes)

    print(f"Pakker ut .PAK til {DATA}...")
    found = extract_paks(tmp_iso, DATA)
    tmp_iso.unlink(missing_ok=True)

    expected = parse_filelist()
    ok = True
    for name in NEEDED:
        path = DATA / name
        if not path.exists():
            print(f"  MANGLER: {name}")
            ok = False
            continue
        digest = hashlib.md5(path.read_bytes()).hexdigest()
        exp = expected.get(name)
        if exp and digest != exp:
            print(f"  MD5 avvik {name}: fikk {digest}, forventet {exp}")
            ok = False
        else:
            print(f"  OK {name}")

    if ok:
        print("\nAlle PAK-filer på plass og MD5 stemmer (EU v1.07).")
    else:
        print("\nNoen filer mangler eller matcher ikke EU v1.07 — Dynasty kan fortsatt feile.")
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
