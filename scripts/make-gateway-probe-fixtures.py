#!/usr/bin/env python3
"""Create small, random image/PDF/DOCX fixtures without third-party packages."""
import argparse
import base64
import json
from pathlib import Path
import secrets
import struct
import zipfile
import zlib


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    glyphs = {
        'C': '01111 10000 10000 10000 10000 10000 01111',
        'O': '01110 10001 10001 10001 10001 10001 01110',
        'D': '11110 10001 10001 10001 10001 10001 11110',
        'E': '11111 10000 10000 11110 10000 10000 11111',
        'U': '10001 10001 10001 10001 10001 10001 01110',
        'N': '10001 11001 10101 10011 10001 10001 10001',
        'T': '11111 00100 00100 00100 00100 00100 00100',
        '0': '01110 10001 10011 10101 11001 10001 01110',
        '1': '00100 01100 00100 00100 00100 00100 01110',
        '2': '01110 10001 00001 00010 00100 01000 11111',
        '3': '11110 00001 00001 01110 00001 00001 11110',
        '4': '00010 00110 01010 10010 11111 00010 00010',
        '5': '11111 10000 10000 11110 00001 00001 11110',
        '6': '01110 10000 10000 11110 10001 10001 01110',
        '7': '11111 00001 00010 00100 01000 01000 01000',
        '8': '01110 10001 10001 01110 10001 10001 01110',
        '9': '01110 10001 10001 01111 00001 00001 01110',
    }
    code = ''.join(str(secrets.randbelow(10)) for _ in range(8))
    text = ['CODE ' + code, 'COUNT 73']
    width, height, scale = 760, 220, 8
    pixels = [bytearray([255]) * width for _ in range(height)]
    for line_number, line in enumerate(text):
        for char_number, char in enumerate(line):
            for y, row in enumerate(glyphs.get(char, '00000 ' * 7).split()):
                for x, bit in enumerate(row):
                    if bit == '1':
                        for dy in range(scale):
                            yy = 30 + line_number * 90 + y * scale + dy
                            xx = 30 + char_number * 6 * scale + x * scale
                            pixels[yy][xx:xx + scale] = bytes(scale)

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 0, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(b''.join(b'\0' + row for row in pixels))) + chunk(b'IEND', b'')
    (args.output / 'image.png').write_bytes(png)
    doc_code = 'BIRCH-' + secrets.token_hex(5).upper()
    document_text = f'Verification code: {doc_code}. Quantity: 47.'
    with zipfile.ZipFile(args.output / 'document.docx', 'w') as z:
        z.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        z.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        z.writestr('word/document.xml', f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{document_text}</w:t></w:r></w:p></w:body></w:document>')
    stream = f'BT /F1 18 Tf 36 740 Td ({document_text}) Tj ET'.encode()
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
               b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
               b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
               f'<< /Length {len(stream)} >>\nstream\n'.encode() + stream + b'\nendstream']
    pdf, offsets = b'%PDF-1.4\n', [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf += f'{index} 0 obj\n'.encode() + obj + b'\nendobj\n'
    xref = len(pdf)
    pdf += f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode()
    pdf += b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets[1:])
    pdf += f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    (args.output / 'document.pdf').write_bytes(pdf)
    expected = {'image': text, 'document': document_text}
    (args.output / 'expected.json').write_text(json.dumps(expected, indent=2))
    files = [{'kind': kind, 'name': filename, 'mime': mime, 'base64': base64.b64encode((args.output / filename).read_bytes()).decode()}
             for kind, filename, mime in [('image', 'image.png', 'image/png'), ('pdf', 'document.pdf', 'application/pdf'),
                                         ('docx', 'document.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')]]
    (args.output / 'upload-bundle.json').write_text(json.dumps(files))
    print(json.dumps(expected))


if __name__ == '__main__':
    main()
