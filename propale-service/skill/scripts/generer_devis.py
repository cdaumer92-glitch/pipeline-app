#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Génération d'un devis simple TexasWin en PDF (reportlab).

Usage : python3 generer_devis.py config.json sortie.pdf

config.json attendu :
{
  "numero":       "DEV-2026-047",
  "date_fr":      "31/07/2026",
  "validite":     "1 mois",
  "societe":      "CHEVIGNON",
  "adresse":      "36, rue du Faubourg Saint Antoine, 75012 Paris",
  "attention_de": "Philippe Carrara",
  "tva_rate":     20,
  "lignes": [
    {"ref": "DEVELOPPEMENT", "designation": "...", "pu": 1150.0, "qte": 3, "remise": 10, "total": 3105.0}
  ],
  "total_ht": 4885.0, "tva": 977.0, "total_ttc": 5862.0
}
Les totaux sont recalculés côté script (source de vérité : les lignes).
"""
import json
import sys
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_RIGHT
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, KeepTogether
)

SCRIPT_DIR = Path(__file__).resolve().parent
LOGO_PATH = SCRIPT_DIR.parent / "assets" / "logo-texaswin.png"

BLEU_NUIT = colors.HexColor("#0B1F4E")
BLEU = colors.HexColor("#10a0dc")
GRIS = colors.HexColor("#6b7280")
GRIS_LIGNE = colors.HexColor("#d7dbe2")

S_BASE = ParagraphStyle("base", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.black)
S_PETIT = ParagraphStyle("petit", parent=S_BASE, fontSize=8, leading=10.5, textColor=GRIS)
S_CELL = ParagraphStyle("cell", parent=S_BASE, fontSize=8.5, leading=11)
S_REF = ParagraphStyle("ref", parent=S_BASE, fontSize=7.5, leading=10, textColor=colors.HexColor("#0d7fb0"))
S_NUM = ParagraphStyle("num", parent=S_CELL, alignment=TA_RIGHT)


def fmt_eur(x):
    """1234.5 -> '1 234,50 €' (format français)."""
    try:
        x = float(x)
    except (TypeError, ValueError):
        x = 0.0
    s = f"{x:,.2f}".replace(",", " ").replace(".", ",")
    return s + " €"


class NumeroteurCanvas(rl_canvas.Canvas):
    """Canvas deux passes pour afficher « Page n/Total » en pied de page."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pages = []

    def showPage(self):
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._pages)
        for state in self._pages:
            self.__dict__.update(state)
            self._dessiner_pied(total)
            super().showPage()
        super().save()

    def _dessiner_pied(self, total):
        self.setFont("Helvetica", 7.5)
        self.setFillColor(GRIS)
        self.drawRightString(A4[0] - 15 * mm, 10 * mm, f"Page {self._pageNumber}/{total}")
        self.drawString(15 * mm, 10 * mm,
                        "SAS ASTI · 19, rue de la Résistance, 42300 Roanne · Siret 401 646 534 00057")


def image_logo():
    """Logo TexasWin, débarrassé du liseré d'1-2 px présent sur les bords du PNG
    source (sinon le logo apparaît « encadré » sur le devis)."""
    if not LOGO_PATH.exists():
        return None
    import tempfile
    from PIL import Image as PILImage
    with PILImage.open(LOGO_PATH) as im:
        im = im.convert("RGBA")
        im = im.crop((2, 2, im.width - 2, im.height - 2))
        # Rogner aussi les marges blanches internes pour que le bord gauche du
        # logo tombe exactement sur l'alignement du texte en dessous.
        gris = im.convert("L")
        bbox = gris.point(lambda p: 255 if p < 245 else 0).getbbox()
        if bbox:
            im = im.crop(bbox)
        ratio = im.height / im.width
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        im.save(tmp.name)
    largeur = 48 * mm
    logo = Image(tmp.name, width=largeur, height=largeur * ratio)
    logo.hAlign = "LEFT"  # sinon l'image est centrée dans la colonne
    return logo


def bloc_entete(cfg):
    """En-tête : logo + coordonnées ASTI à gauche ; cadres devis + client à droite."""
    gauche = []
    logo = image_logo()
    if logo is not None:
        gauche.append(logo)
        gauche.append(Spacer(1, 4 * mm))
    gauche.append(Paragraph(
        "<b>SAS ASTI</b><br/>19, rue de la Résistance<br/>42300 Roanne<br/><br/>"
        "Tél : 04 77 23 13 33<br/>Web : www.texaswin.fr<br/>"
        "Siret : 401 646 534 00057<br/>TVA Intra : FR 85 401 646 534", S_BASE))

    cadre_devis = Table([[Paragraph(
        f"<b><font color='#0B1F4E' size='10'>DEVIS N° {cfg.get('numero','')}</font></b><br/>"
        f"Date : {cfg.get('date_fr','')}<br/>"
        f"Validité de l'offre : {cfg.get('validite','1 mois')}", S_BASE)]],
        colWidths=[72 * mm])
    cadre_devis.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, GRIS_LIGNE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    attention = cfg.get("attention_de") or ""
    client_html = f"<b>{cfg.get('societe','')}</b><br/>{(cfg.get('adresse') or '').replace(chr(10), '<br/>')}"
    if attention:
        client_html += f"<br/><br/>À l'attention de : <b>{attention}</b>"
    cadre_client = Table([[Paragraph(client_html, S_BASE)]], colWidths=[72 * mm])
    cadre_client.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, GRIS_LIGNE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    droite = [cadre_devis, Spacer(1, 5 * mm), cadre_client]

    entete = Table([[gauche, droite]], colWidths=[98 * mm, 82 * mm])
    entete.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return entete


def tableau_lignes(lignes):
    entetes = ["Réf", "Désignation", "PU HT", "Qté", "Remise", "Total HT"]
    data = [entetes]
    for l in lignes:
        remise = float(l.get("remise") or 0)
        data.append([
            Paragraph(f"<b>{(l.get('ref') or '').upper()}</b>", S_REF),
            Paragraph((l.get("designation") or "").replace(chr(10), "<br/>"), S_CELL),
            Paragraph(fmt_eur(l.get("pu")), S_NUM),
            Paragraph(f"{float(l.get('qte') or 0):g}".replace(".", ","), S_NUM),
            Paragraph(f"{remise:g} %".replace(".", ",") if remise else "—", S_NUM),
            Paragraph(f"<b>{fmt_eur(l.get('total'))}</b>", S_NUM),
        ])
    t = Table(data, colWidths=[30 * mm, 70 * mm, 22 * mm, 12 * mm, 16 * mm, 30 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLEU_NUIT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("ALIGN", (2, 0), (-1, 0), "RIGHT"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, GRIS_LIGNE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def bloc_pied(cfg, total_ht, tva, total_ttc, tva_rate):
    signature = Table(
        [[Paragraph("<i>« Bon pour accord », tampon &amp; signature</i>", S_PETIT)]],
        colWidths=[78 * mm], rowHeights=[30 * mm])
    signature.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, GRIS_LIGNE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    gauche = [signature, Spacer(1, 4 * mm),
              Paragraph("Conditions de paiement : virement 30 jours date de facture", S_PETIT)]

    totaux = Table([
        ["Total HT", fmt_eur(total_ht)],
        [f"TVA {tva_rate:g} %".replace(".", ","), fmt_eur(tva)],
        ["Total TTC", fmt_eur(total_ttc)],
    ], colWidths=[34 * mm, 36 * mm])
    totaux.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 1), "Helvetica"),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 2), (-1, 2), BLEU_NUIT),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, 2), (-1, 2), 0.8, BLEU_NUIT),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))

    pied = Table([[gauche, totaux]], colWidths=[104 * mm, 76 * mm])
    pied.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return KeepTogether([pied])


def generer(cfg, sortie):
    lignes = cfg.get("lignes") or []
    # Recalcul des totaux depuis les lignes (source de vérité)
    for l in lignes:
        pu = float(l.get("pu") or 0)
        qte = float(l.get("qte") or 0)
        remise = float(l.get("remise") or 0)
        l["total"] = round(pu * qte * (1 - remise / 100), 2)
    total_ht = round(sum(l["total"] for l in lignes), 2)
    tva_rate = float(cfg.get("tva_rate") or 20)
    tva = round(total_ht * tva_rate / 100, 2)
    total_ttc = round(total_ht + tva, 2)

    doc = SimpleDocTemplate(
        str(sortie), pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=12 * mm, bottomMargin=18 * mm,
        title=f"Devis {cfg.get('numero','')} — {cfg.get('societe','')}",
        author="SAS ASTI — TexasWin")

    elements = [
        bloc_entete(cfg),
        Spacer(1, 8 * mm),
        tableau_lignes(lignes),
        Spacer(1, 10 * mm),
        bloc_pied(cfg, total_ht, tva, total_ttc, tva_rate),
    ]
    doc.build(elements, canvasmaker=NumeroteurCanvas)
    return {"total_ht": total_ht, "tva": tva, "total_ttc": total_ttc}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage : generer_devis.py config.json sortie.pdf", file=sys.stderr)
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8") as f:
        cfg = json.load(f)
    totaux = generer(cfg, sys.argv[2])
    print(f"OK - Devis genere : {sys.argv[2]} (HT {totaux['total_ht']} / TTC {totaux['total_ttc']})")
