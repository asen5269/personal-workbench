import sys
import zipfile
import pymupdf

try:
    with pymupdf.open(sys.argv[1]) as document:
        if document.needs_pass or document.page_count > 100:
            raise ValueError("PDF needs a password or exceeds 100 pages")
        if sys.argv[3] == "txt":
            text = "\n\f\n".join(page.get_text() for page in document)
            if not text.strip():
                raise ValueError("No text found; OCR is required")
            with open(sys.argv[2], "w", encoding="utf-8") as output:
                output.write(text)
        else:
            with zipfile.ZipFile(sys.argv[2], "w", zipfile.ZIP_DEFLATED) as archive:
                for index, page in enumerate(document):
                    scale = min(2, 3000 / max(page.rect.width, page.rect.height))
                    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
                    archive.writestr(f"page-{index + 1:03d}.{sys.argv[3]}", pixmap.tobytes("jpeg" if sys.argv[3] == "jpg" else "png"))
except Exception:
    sys.exit(1)
