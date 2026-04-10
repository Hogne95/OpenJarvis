from __future__ import annotations

from pathlib import Path
import re
import textwrap


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "user-guide" / "jarvis-user-manual.md"
OUTPUT = ROOT / "docs" / "user-guide" / "jarvis-user-manual.pdf"

PAGE_WIDTH = 612
PAGE_HEIGHT = 792
LEFT = 54
RIGHT = 54
TOP = 56
BOTTOM = 54
FONT_SIZE = 11
LEADING = 15
MAX_CHARS = 88


def pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def normalize_markdown(md: str) -> list[str]:
    lines: list[str] = []
    in_code = False
    for raw in md.splitlines():
        line = raw.rstrip()
        if line.startswith("---") and not lines:
            continue
        if line.startswith("```"):
            in_code = not in_code
            if in_code:
                lines.append("")
                lines.append("[Code]")
            else:
                lines.append("")
            continue
        if line.startswith("title:") or line.startswith("description:"):
            continue
        if not line.strip():
            lines.append("")
            continue
        if in_code:
            lines.append(f"    {line}")
            continue
        if line.startswith("# "):
            lines.append("")
            lines.append(line[2:].upper())
            lines.append("")
            continue
        if line.startswith("## "):
            lines.append("")
            lines.append(line[3:].upper())
            lines.append("")
            continue
        if re.match(r"^\d+\.\s+", line):
            lines.extend(textwrap.wrap(line, width=MAX_CHARS, subsequent_indent="   "))
            continue
        if line.startswith("- "):
            bullet = "• " + line[2:]
            lines.extend(textwrap.wrap(bullet, width=MAX_CHARS, subsequent_indent="  "))
            continue
        lines.extend(textwrap.wrap(line, width=MAX_CHARS))
    return lines


def paginate(lines: list[str]) -> list[list[str]]:
    pages: list[list[str]] = []
    current: list[str] = []
    y = PAGE_HEIGHT - TOP
    for line in lines:
        needed = LEADING if line else LEADING // 2
        if y - needed < BOTTOM:
            pages.append(current)
            current = []
            y = PAGE_HEIGHT - TOP
        current.append(line)
        y -= needed
    if current:
        pages.append(current)
    return pages


def build_content_stream(page_lines: list[str], page_num: int, total_pages: int) -> bytes:
    y = PAGE_HEIGHT - TOP
    parts = ["BT", f"/F1 {FONT_SIZE} Tf", f"{LEFT} {y} Td", f"{LEADING} TL"]
    for line in page_lines:
        if line:
            parts.append(f"({pdf_escape(line)}) Tj")
        parts.append("T*")
    footer_y = 24
    parts.extend(
        [
            f"1 0 0 1 {LEFT} {footer_y} Tm",
            "/F1 9 Tf",
            f"(JARVIS User Manual   Page {page_num} of {total_pages}) Tj",
            "ET",
        ]
    )
    return "\n".join(parts).encode("latin-1", errors="replace")


def build_pdf(pages: list[list[str]]) -> bytes:
    objects: list[bytes] = []

    def add_object(data: bytes) -> int:
        objects.append(data)
        return len(objects)

    font_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    content_ids: list[int] = []
    page_ids: list[int] = []
    total = len(pages)

    for index, page_lines in enumerate(pages, start=1):
        stream = build_content_stream(page_lines, index, total)
        content = b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
        content_ids.append(add_object(content))
        page_ids.append(0)

    pages_kids_placeholder = "__KIDS__"
    pages_obj_index = add_object(f"<< /Type /Pages /Kids {pages_kids_placeholder} /Count {len(pages)} >>".encode())

    for idx, content_id in enumerate(content_ids):
        page_obj = (
            f"<< /Type /Page /Parent {pages_obj_index} 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"
        ).encode()
        page_ids[idx] = add_object(page_obj)

    kids = "[ " + " ".join(f"{pid} 0 R" for pid in page_ids) + " ]"
    objects[pages_obj_index - 1] = f"<< /Type /Pages /Kids {kids} /Count {len(pages)} >>".encode()

    catalog_id = add_object(f"<< /Type /Catalog /Pages {pages_obj_index} 0 R >>".encode())

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{i} 0 obj\n".encode())
        output.extend(obj)
        output.extend(b"\nendobj\n")

    xref_pos = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
            f"startxref\n{xref_pos}\n%%EOF\n"
        ).encode()
    )
    return bytes(output)


def main() -> None:
    md = SOURCE.read_text(encoding="utf-8")
    lines = normalize_markdown(md)
    pages = paginate(lines)
    OUTPUT.write_bytes(build_pdf(pages))
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
