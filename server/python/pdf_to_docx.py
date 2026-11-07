import contextlib
import io
import logging
import sys


def main():
    try:
        import pymupdf
        from pdf2docx import Converter
    except ImportError:
        return 6

    logging.disable(logging.CRITICAL)
    pymupdf.TOOLS.mupdf_display_errors(False)
    pymupdf.TOOLS.mupdf_display_warnings(False)
    data = sys.stdin.buffer.read(20 * 1024 * 1024 + 1)
    if len(data) > 20 * 1024 * 1024:
        return 5
    try:
        with pymupdf.open(stream=data, filetype="pdf") as document:
            if document.needs_pass:
                return 2
            if document.page_count > 100:
                return 5
            if not document.page_count or not any(page.get_text().strip() for page in document):
                return 3
        output = io.BytesIO()
        with contextlib.redirect_stdout(sys.stderr):
            converter = Converter(stream=data)
            try:
                converter.convert(output, multi_processing=False, ignore_page_error=False)
            finally:
                converter.close()
        sys.stdout.buffer.write(output.getvalue())
        return 0
    except Exception:
        return 4


if __name__ == "__main__":
    sys.exit(main())
