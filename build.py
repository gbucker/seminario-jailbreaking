#!/usr/bin/env python3
"""Gera index.html a partir de src/template.html, embutindo o xterm.js (offline, arquivo único).

Edite sempre src/template.html e rode:  python build.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
VENDOR = ROOT / "vendor"


def lib(name: str) -> str:
    txt = (VENDOR / name).read_text(encoding="utf-8")
    txt = re.sub(r"\n?//# sourceMappingURL=.*$", "", txt, flags=re.M)
    txt = re.sub(r"/\*# sourceMappingURL=.*?\*/", "", txt)
    return txt.replace("</script", "<\\/script")


def main() -> None:
    html = (ROOT / "src" / "template.html").read_text(encoding="utf-8")
    parts = {
        "/*XTERM_CSS*/": lib("xterm-6.0.0.css"),
        "/*XTERM_JS*/": lib("xterm-6.0.0.min.js"),
        "/*XTERM_FIT*/": lib("addon-fit-0.11.0.min.js"),
    }
    for marker, content in parts.items():
        if marker not in html:
            raise SystemExit(f"marcador {marker} não encontrado em src/template.html")
        html = html.replace(marker, content, 1)
    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8", newline="\n")
    print(f"index.html gerado ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
