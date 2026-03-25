#!/usr/bin/env python3
"""
Extrae el contenido del CPCA (Código Procesal Civil Adversarial de Neuquén)
desde el PDF y genera un archivo JSON estructurado.

Estrategia:
1. Extraer títulos de artículos del ÍNDICE (páginas 1-34)
2. Extraer contenido de artículos del cuerpo (página 50+)
3. Usar los títulos del índice para separar título de contenido en el cuerpo
"""

import json
import re
import sys
import os

try:
    import pymupdf
except ImportError:
    os.system("pip3 install pymupdf")
    import pymupdf


def extract_toc_titles(doc):
    """Extrae los títulos de artículos del índice (páginas 0-34)."""
    toc_text = ''
    for i in range(0, 35):
        toc_text += doc[i].get_text()

    lines = toc_text.split('\n')
    titles = {}
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m = re.match(r'Artículo\s+(\d+)\s+(.*)', line)
        if m:
            num = int(m.group(1))
            title = m.group(2).strip()
            while i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if (re.match(r'Artículo\s+\d+', next_line) or
                    re.match(r'(LIBRO|TÍTULO|CAPÍTULO|Sección|ÍNDICE|EXPOSICIÓN)', next_line) or
                    not next_line):
                    break
                title += ' ' + next_line
                i += 1
            titles[num] = re.sub(r'\s+', ' ', title).strip()
        i += 1
    return titles


def extract_body_text(doc, start_page=49):
    """Extrae texto del cuerpo del código."""
    full_text = ''
    for i in range(start_page, len(doc)):
        full_text += doc[i].get_text()
    return full_text


def parse_structure(text, toc_titles):
    """Parsea la jerarquía completa del código."""
    lines = text.split('\n')

    structure = {
        "titulo": "Código Procesal Civil Adversarial",
        "jurisdiccion": "Provincia del Neuquén",
        "libros": []
    }

    libro_names = {
        'PRIMERO': 'Primero', 'SEGUNDO': 'Segundo', 'TERCERO': 'Tercero',
        'CUARTO': 'Cuarto', 'QUINTO': 'Quinto', 'SEXTO': 'Sexto'
    }

    current_libro = None
    current_titulo = None
    current_capitulo = None
    current_seccion = None
    current_articulo = None
    collecting_content = False

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Skip empty and standalone page numbers
        if not line or re.match(r'^\d{1,3}$', line):
            if collecting_content and current_articulo and line:
                pass  # page numbers shouldn't be added
            i += 1
            continue

        # === LIBRO ===
        m = re.match(
            r'^LIBRO\s+(PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO)[:\s]*(.*)', line)
        if m:
            flush_article(current_articulo, current_seccion, current_capitulo)
            current_articulo = None
            collecting_content = False
            current_seccion = None
            current_capitulo = None
            current_titulo = None

            nombre = libro_names.get(m.group(1), m.group(1))
            titulo_libro = m.group(2).strip()
            if not titulo_libro:
                i += 1
                titulo_libro = grab_header_title(lines, i)
                i += count_header_lines(lines, i)

            current_libro = {
                "id": f"libro-{len(structure['libros']) + 1}",
                "numero": nombre,
                "titulo": clean_title(titulo_libro),
                "titulos": []
            }
            structure["libros"].append(current_libro)
            i += 1
            continue

        # === TÍTULO ===
        m = re.match(r'^TÍTULO\s+([IVXLC]+)\s*$', line)
        if m and current_libro:
            flush_article(current_articulo, current_seccion, current_capitulo)
            current_articulo = None
            collecting_content = False
            current_seccion = None
            current_capitulo = None

            num = m.group(1)
            i += 1
            name = grab_header_title(lines, i)
            i += count_header_lines(lines, i)

            current_titulo = {
                "id": f"titulo-{current_libro['id']}-{num}",
                "numero": num,
                "titulo": clean_title(name),
                "capitulos": []
            }
            current_libro["titulos"].append(current_titulo)
            continue

        # === CAPÍTULO ===
        m = re.match(r'^CAPÍTULO\s+([IVXLC]+)\s*$', line)
        if m and current_titulo:
            flush_article(current_articulo, current_seccion, current_capitulo)
            current_articulo = None
            collecting_content = False
            current_seccion = None

            num = m.group(1)
            i += 1
            name = grab_header_title(lines, i)
            i += count_header_lines(lines, i)

            current_capitulo = {
                "id": f"cap-{current_titulo['id']}-{num}",
                "numero": num,
                "titulo": clean_title(name),
                "secciones": [],
                "articulos": []
            }
            current_titulo["capitulos"].append(current_capitulo)
            continue

        # === Sección ===
        m = re.match(r'^Sección\s+(\d+)\.ª\s*[-–]?\s*(.*)', line)
        if m and current_capitulo:
            flush_article(current_articulo, current_seccion, current_capitulo)
            current_articulo = None
            collecting_content = False

            num = m.group(1)
            sec_name = m.group(2).strip()
            if not sec_name:
                i += 1
                sec_name = grab_header_title(lines, i)
                i += count_header_lines(lines, i)
            else:
                i += 1

            current_seccion = {
                "id": f"sec-{current_capitulo['id']}-{num}",
                "numero": num,
                "titulo": clean_title(sec_name),
                "articulos": []
            }
            current_capitulo["secciones"].append(current_seccion)
            continue

        # === Artículo ===
        m = re.match(r'^Artículo\s+(\d+)\s*$', line)
        if m:
            flush_article(current_articulo, current_seccion, current_capitulo)

            num = int(m.group(1))
            toc_title = toc_titles.get(num, '')

            # Now we need to skip the title lines in the body and grab content
            # The title from TOC tells us what to expect
            i += 1
            body_title, content_start = extract_article_title_and_content(
                lines, i, toc_title)

            art_title = toc_title if toc_title else body_title

            current_articulo = {
                "id": f"art-{num}",
                "numero": num,
                "titulo": clean_title(art_title),
                "contenido": ""
            }
            collecting_content = True
            i = content_start
            continue

        # === Content lines ===
        if collecting_content and current_articulo:
            if current_articulo["contenido"]:
                current_articulo["contenido"] += '\n' + line
            else:
                current_articulo["contenido"] = line

        i += 1

    # Flush last article
    flush_article(current_articulo, current_seccion, current_capitulo)

    # Clean all article content
    clean_all_content(structure)

    return structure


def extract_article_title_and_content(lines, start, toc_title):
    """
    Dado el inicio después de 'Artículo N', determina dónde termina el título
    y dónde empieza el contenido.

    Si tenemos título del TOC, lo usamos para saber cuántas líneas ocupa.
    """
    if not toc_title:
        # Fallback: first line is title, rest is content
        i = start
        while i < len(lines) and not lines[i].strip():
            i += 1
        if i < len(lines):
            title = lines[i].strip()
            return title, i + 1
        return '', start

    # Normalize TOC title for matching
    toc_norm = normalize(toc_title)

    # Try to match 1, 2, 3 or 4 lines as the title
    for num_lines in range(1, 6):
        candidate_lines = []
        pos = start
        lines_consumed = 0
        while pos < len(lines) and lines_consumed < num_lines:
            stripped = lines[pos].strip()
            if stripped and not re.match(r'^\d{1,3}$', stripped):
                candidate_lines.append(stripped)
                lines_consumed += 1
            pos += 1

        candidate = ' '.join(candidate_lines)
        candidate_norm = normalize(candidate)

        # Check if the TOC title starts with this candidate or vice versa
        if toc_norm.startswith(candidate_norm) or candidate_norm.startswith(toc_norm):
            # Find the actual position after the title
            return ' '.join(candidate_lines), pos
        # Also check if candidate contains the toc title
        if toc_norm in candidate_norm:
            return ' '.join(candidate_lines), pos

    # If we couldn't match, use the TOC title and try to skip matching lines
    # Find how far the title extends in the body text
    i = start
    accumulated = ''
    while i < len(lines):
        stripped = lines[i].strip()
        if not stripped or re.match(r'^\d{1,3}$', stripped):
            i += 1
            continue
        test = (accumulated + ' ' + stripped).strip() if accumulated else stripped
        test_norm = normalize(test)

        if toc_norm.startswith(test_norm):
            accumulated = test
            i += 1
            if test_norm == toc_norm:
                return accumulated, i
        else:
            # Title is done, content starts here
            break

    return toc_title, i


def normalize(text):
    """Normaliza texto para comparación."""
    import unicodedata
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    text = re.sub(r'\s+', ' ', text.lower().strip())
    text = re.sub(r'[^\w\s]', '', text)
    return text


def flush_article(articulo, seccion, capitulo):
    """Guarda artículo en su contenedor."""
    if articulo is None:
        return
    if seccion is not None:
        seccion["articulos"].append(articulo)
    elif capitulo is not None:
        capitulo["articulos"].append(articulo)


def grab_header_title(lines, start):
    """Recoge título de encabezado (LIBRO, TÍTULO, CAPÍTULO)."""
    parts = []
    i = start
    while i < len(lines):
        line = lines[i].strip()
        if not line or re.match(r'^\d{1,3}$', line):
            i += 1
            continue
        if is_structural(line):
            break
        parts.append(line)
        if len(parts) >= 4:
            break
        i += 1
    return ' '.join(parts)


def count_header_lines(lines, start):
    """Cuenta líneas del encabezado."""
    count = 0
    parts = 0
    i = start
    while i < len(lines):
        line = lines[i].strip()
        if not line or re.match(r'^\d{1,3}$', line):
            count += 1
            i += 1
            continue
        if is_structural(line):
            break
        count += 1
        parts += 1
        if parts >= 4:
            break
        i += 1
    return count


def is_structural(line):
    return bool(
        re.match(r'^(LIBRO|TÍTULO|CAPÍTULO)\s+', line) or
        re.match(r'^Sección\s+\d+', line) or
        re.match(r'^Artículo\s+\d+\s*$', line)
    )


def clean_title(text):
    return re.sub(r'\s+', ' ', text).strip().rstrip('.')


def clean_all_content(structure):
    for libro in structure["libros"]:
        for titulo in libro["titulos"]:
            for capitulo in titulo["capitulos"]:
                for art in capitulo["articulos"]:
                    art["contenido"] = clean_content(art["contenido"])
                for seccion in capitulo["secciones"]:
                    for art in seccion["articulos"]:
                        art["contenido"] = clean_content(art["contenido"])


def clean_content(content):
    content = re.sub(r'^\s*\d{1,3}\s*$', '', content, flags=re.MULTILINE)
    content = re.sub(r'[ \t]+', ' ', content)
    content = re.sub(r'\n{3,}', '\n\n', content)
    lines = [l.strip() for l in content.split('\n')]
    return '\n'.join(lines).strip()


def count_articles(structure):
    total = 0
    for libro in structure["libros"]:
        for titulo in libro["titulos"]:
            for cap in titulo["capitulos"]:
                total += len(cap["articulos"])
                for sec in cap["secciones"]:
                    total += len(sec["articulos"])
    return total


def validate(structure):
    """Valida la estructura extraída."""
    all_nums = []
    empty_content = []
    short_titles = []

    for libro in structure["libros"]:
        for titulo in libro["titulos"]:
            for cap in titulo["capitulos"]:
                for art in cap["articulos"]:
                    all_nums.append(art["numero"])
                    if not art["contenido"]:
                        empty_content.append(art["numero"])
                    if not art["titulo"]:
                        short_titles.append(art["numero"])
                for sec in cap["secciones"]:
                    for art in sec["articulos"]:
                        all_nums.append(art["numero"])
                        if not art["contenido"]:
                            empty_content.append(art["numero"])
                        if not art["titulo"]:
                            short_titles.append(art["numero"])

    all_sorted = sorted(all_nums)
    missing = [n for n in range(1, all_sorted[-1] + 1) if n not in all_nums]
    dupes = sorted(set(n for n in all_nums if all_nums.count(n) > 1))

    print(f"Rango: {all_sorted[0]} a {all_sorted[-1]}")
    if missing:
        print(f"Faltantes ({len(missing)}): {missing}")
    else:
        print("Sin artículos faltantes")
    if dupes:
        print(f"Duplicados: {dupes}")
    if empty_content:
        print(f"Sin contenido ({len(empty_content)}): {empty_content[:10]}{'...' if len(empty_content)>10 else ''}")
    if short_titles:
        print(f"Sin título ({len(short_titles)}): {short_titles}")


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(script_dir)
    pdf_path = os.path.join(base_dir, "data", "CPCA.pdf")
    output_path = os.path.join(base_dir, "data", "codigo-procesal.json")

    if not os.path.exists(pdf_path):
        print(f"Error: PDF no encontrado en {pdf_path}")
        sys.exit(1)

    print("Abriendo PDF...")
    doc = pymupdf.open(pdf_path)

    print("Extrayendo títulos del índice...")
    toc_titles = extract_toc_titles(doc)
    print(f"  {len(toc_titles)} títulos encontrados en el índice")

    print("Extrayendo texto del cuerpo...")
    body_text = extract_body_text(doc)
    doc.close()

    print("Parseando estructura jerárquica...")
    structure = parse_structure(body_text, toc_titles)

    total_arts = count_articles(structure)
    total_titulos = sum(len(l["titulos"]) for l in structure["libros"])
    total_caps = sum(len(t["capitulos"]) for l in structure["libros"] for t in l["titulos"])
    total_secs = sum(len(c["secciones"]) for l in structure["libros"] for t in l["titulos"] for c in t["capitulos"])

    print(f"\nLibros: {len(structure['libros'])}")
    print(f"Títulos: {total_titulos}")
    print(f"Capítulos: {total_caps}")
    print(f"Secciones: {total_secs}")
    print(f"Artículos: {total_arts}")
    print()
    validate(structure)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(structure, f, ensure_ascii=False, indent=2)
    print(f"\nJSON guardado en {output_path}")


if __name__ == "__main__":
    main()
