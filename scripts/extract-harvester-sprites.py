#!/usr/bin/env python3
"""Extract 8 facing harvester sprites (UNITS.SHP #10-17) from dune.pak -> harvester-game.png."""
from __future__ import annotations

import struct
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Installer Pillow: python -m pip install --user pillow", file=sys.stderr)
    raise

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "_vendor" / "dunedynasty" / "static" / "general" / "data"
OUT = ROOT / "images" / "moniac" / "harvester-game.png"
# groundSpriteID 248 = UNITS.SHP (base 238) index 10, +7 directions
UNITS_START = 10
UNITS_COUNT = 8
FRAME_W = 24


def format80_decode(dest: bytearray, source: bytes, dest_len: int) -> int:
    pos = 0
    d = 0
    end = dest_len
    while d < end and pos < len(source):
        flag = source[pos]
        pos += 1
        if (flag & 0x80) == 0:
            size = (flag >> 4) + 3
            if size > end - d:
                size = end - d
            offset = ((flag & 0xF) << 8) + source[pos]
            pos += 1
            for _ in range(size):
                dest[d] = dest[d - offset] if d >= offset else 0
                d += 1
        elif flag == 0x80:
            break
        elif flag == 0xFE:
            size = source[pos] + (source[pos + 1] << 8)
            pos += 2
            val = source[pos]
            pos += 1
            if size > end - d:
                size = end - d
            for _ in range(size):
                dest[d] = val
                d += 1
        elif flag == 0xFF:
            size = source[pos] + (source[pos + 1] << 8)
            pos += 2
            off = source[pos] + (source[pos + 1] << 8)
            pos += 2
            if size > end - d:
                size = end - d
            s = end - dest_len + off
            for _ in range(size):
                dest[d] = dest[s] if 0 <= s < len(dest) else 0
                d += 1
                s += 1
        elif flag & 0x40:
            size = (flag & 0x3F) + 3
            if size > end - d:
                size = end - d
            off = source[pos] + (source[pos + 1] << 8)
            pos += 2
            s = end - dest_len + off
            for _ in range(size):
                dest[d] = dest[s] if 0 <= s < len(dest) else 0
                d += 1
                s += 1
        else:
            size = flag & 0x3F
            if size > end - d:
                size = end - d
            for _ in range(size):
                if pos >= len(source):
                    return d
                dest[d] = source[pos]
                d += 1
                pos += 1
    return d


def pak_read_file(pak_path: Path, name: str) -> bytes:
    data = pak_path.read_bytes()
    pos = 0
    entries: list[tuple[str, int]] = []
    while pos + 4 <= len(data):
        offset = struct.unpack_from("<I", data, pos)[0]
        pos += 4
        if offset == 0:
            break
        nb = bytearray()
        while pos < len(data):
            b = data[pos]
            pos += 1
            if b == 0:
                break
            nb.append(b)
        entries.append((bytes(nb).decode("ascii", "replace").lower(), offset))
    idx = next(i for i, (n, _) in enumerate(entries) if n == name.lower())
    start = entries[idx][1]
    end = entries[idx + 1][1] if idx + 1 < len(entries) else len(data)
    return data[start:end]


def decode_sprite_payload(raw: bytes) -> bytes:
    p = 2 + 1 + 2 + 3 + 2
    buf = bytearray(0xFFFF)
    n = format80_decode(buf, raw[p:], 0xFFFF)
    return bytes(buf[:n])


def load_palette(pak_path: Path) -> list[tuple[int, int, int, int]]:
    pal_data = pak_read_file(pak_path, "ibm.pal")
    colors: list[tuple[int, int, int, int]] = [(0, 0, 0, 0)]
    for i in range(256):
        o = i * 3
        r = (pal_data[o] << 2) | (pal_data[o] >> 4)
        g = (pal_data[o + 1] << 2) | (pal_data[o + 1] >> 4)
        b = (pal_data[o + 2] << 2) | (pal_data[o + 2] >> 4)
        colors.append((r, g, b, 0 if i == 0 else 255))
    return colors


def main() -> int:
    pak = DATA / "dune.pak"
    if not pak.exists():
        print(f"Mangler {pak}", file=sys.stderr)
        return 1

    units = pak_read_file(pak, "units.shp")
    pal = load_palette(pak)
    frames: list[Image.Image] = []

    for idx in range(UNITS_START, UNITS_START + UNITS_COUNT):
        off = struct.unpack_from("<I", units, 2 + idx * 4)[0]
        size = struct.unpack_from("<H", units, off + 6)[0]
        pix = decode_sprite_payload(units[off : off + size])
        h = (len(pix) + FRAME_W - 1) // FRAME_W
        img = Image.new("RGBA", (FRAME_W, h))
        px = img.load()
        for y in range(h):
            for x in range(FRAME_W):
                i = y * FRAME_W + x
                if i < len(pix):
                    px[x, y] = pal[pix[i]]
        frames.append(img)

    cw = max(im.width for im in frames)
    ch = max(im.height for im in frames)
    sheet = Image.new("RGBA", (cw, ch * len(frames)), (0, 0, 0, 0))
    for d, im in enumerate(frames):
        sheet.paste(im, (0, d * ch))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)
    print(f"Lagret {OUT} ({sheet.width}x{sheet.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
