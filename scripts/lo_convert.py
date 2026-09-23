#!/usr/bin/env python3
"""Converte DOCX em PDF com LibreOffice (UNO), atualizando antes os índices (sumário).

Uso: python3 scripts/lo_convert.py entrada.docx saida.pdf
Requer LibreOffice Writer e o módulo Python `uno`. Usa um perfil temporário isolado.
"""
import os, subprocess, sys, tempfile, time, shutil
import uno
from com.sun.star.beans import PropertyValue


def prop(name, value):
    p = PropertyValue()
    p.Name = name
    p.Value = value
    return p


def main(src, dst):
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        sys.exit("LibreOffice (soffice) não encontrado")
    profile = tempfile.mkdtemp(prefix="vrban-lo-")
    pipe = "vrban_%d" % os.getpid()
    proc = subprocess.Popen(
        [soffice, "--headless", "--invisible", "--norestore", "--nologo",
         "-env:UserInstallation=" + uno.systemPathToFileUrl(profile),
         "--accept=pipe,name=%s;urp;" % pipe],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        ctx = None
        for _ in range(120):
            try:
                ctx = resolver.resolve("uno:pipe,name=%s;urp;StarOffice.ComponentContext" % pipe)
                break
            except Exception:
                time.sleep(0.5)
        if ctx is None:
            sys.exit("Não foi possível ligar ao LibreOffice")
        desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
        doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(os.path.abspath(src)), "_blank", 0, (prop("Hidden", True),))
        if doc is None:
            sys.exit("Documento não carregado")
        # Atualizar índices duas vezes (os números de página estabilizam após a primeira atualização)
        for _ in range(2):
            idx = doc.getDocumentIndexes()
            for i in range(idx.getCount()):
                idx.getByIndex(i).update()
            doc.refresh()
        doc.storeToURL(uno.systemPathToFileUrl(os.path.abspath(dst)), (prop("FilterName", "writer_pdf_Export"),))
        doc.close(True)
        try:
            desktop.terminate()
        except Exception:
            pass
    finally:
        try:
            proc.wait(timeout=30)
        except Exception:
            proc.kill()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
