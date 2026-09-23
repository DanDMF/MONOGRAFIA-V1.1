#!/usr/bin/env python3
"""Verificação independente de um XLSX exportado pelo VRBAN (docs/EXPORTS.md).

1. openpyxl: tipos das células (IDs texto, datas, números, vazios), texto não interpretado como fórmula,
   ausência de macros/ligações externas, primeira linha fixa.
2. LibreOffice (se disponível): recalcula as fórmulas a partir das folhas e compara com
   "Valor calculado pelo sistema" (tolerância relativa 1e-9).
Uso: python3 scripts/verify_xlsx.py ficheiro.xlsx
"""
import os, subprocess, sys, tempfile, shutil, zipfile, datetime
from openpyxl import load_workbook

path = sys.argv[1]
errors, notes = [], []

with zipfile.ZipFile(path) as z:
    names = z.namelist()
    if any("vbaProject" in n or "externalLink" in n for n in names):
        errors.append("contém macros ou ligações externas")

wb = load_workbook(path)  # fórmulas como texto
for ws in wb.worksheets:
    if ws.title in ("LEIA_ME",):
        continue
    if ws.freeze_panes != "A2":
        errors.append(f"{ws.title}: primeira linha não fixa")
    header = [c.value for c in ws[1]]
    for row in ws.iter_rows(min_row=2):
        for h, c in zip(header, row):
            if h == "ID" and c.value is not None and c.data_type != "s":
                errors.append(f"{ws.title}!{c.coordinate}: ID não é texto")
            if isinstance(h, str) and (h.startswith("Data") or h == "Sementeira") and c.value is not None and not isinstance(c.value, datetime.datetime):
                errors.append(f"{ws.title}!{c.coordinate}: data não é data ({type(c.value).__name__})")
            if c.data_type == "f" and ws.title not in ("Indicadores", "Reparticoes"):
                errors.append(f"{ws.title}!{c.coordinate}: fórmula inesperada {c.value!r}")
notes.append("folhas: " + ", ".join(ws.title for ws in wb.worksheets))

# Recalcular com LibreOffice (converter para xlsx força o recálculo; ler valores com data_only)
soffice = shutil.which("soffice") or shutil.which("libreoffice")
if soffice and "Indicadores" in wb.sheetnames:
    out = tempfile.mkdtemp()
    # Remover resultados em cache: o openpyxl regrava fórmulas sem valores calculados,
    # obrigando o LibreOffice a recalcular tudo a partir dos dados das folhas.
    stripped = os.path.join(out, "sem_cache.xlsx")
    load_workbook(path).save(stripped)
    conv = os.path.join(out, "conv")
    subprocess.run([soffice, "--headless", "--calc", "--convert-to", "xlsx", "--outdir", conv, stripped],
                   check=True, capture_output=True, timeout=180)
    rec = load_workbook(os.path.join(conv, "sem_cache.xlsx"), data_only=True)["Indicadores"]
    header = [c.value for c in rec[1]]
    try:
        sc = header.index("Valor calculado pelo sistema")
        fc = header.index("Valor reproduzido no Excel (fórmula)")
        cc = header.index("Indicador (código)")
    except ValueError:
        sc = fc = None
    checked = 0
    if sc is not None:
        for row in rec.iter_rows(min_row=2, values_only=True):
            s, f = row[sc], row[fc]
            if f is None:
                continue
            checked += 1
            if s is None or abs(float(s) - float(f)) > 1e-9 * max(1.0, abs(float(s))):
                errors.append(f"Indicadores {row[cc]}: sistema={s} excel={f}")
    notes.append(f"LibreOffice recalculou {checked} fórmula(s) de indicadores")
    shutil.rmtree(out, ignore_errors=True)
else:
    notes.append("LibreOffice indisponível: recálculo independente não executado")

for n in notes:
    print("·", n)
if errors:
    print("FALHOU:")
    for e in errors:
        print("  -", e)
    sys.exit(1)
print("OK: ficheiro verificado")
