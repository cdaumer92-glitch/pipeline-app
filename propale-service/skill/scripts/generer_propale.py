#!/usr/bin/env python3
"""
Générateur de proposition commerciale TexasWin - version consolidée Avril 2026
Usage: python generer_propale.py config.json [output.docx]

Version autonome : embarque unpack/pack (zip/unzip) sans dépendance externe.
"""

import re, sys, json, shutil, zipfile
from datetime import date
from pathlib import Path
from PIL import Image
import numpy as np

SKILL_DIR = Path(__file__).parent.parent
MASTER    = SKILL_DIR / "templates" / "Master_Propale.docx"
ASSETS    = SKILL_DIR / "assets"


def do_unpack(docx_path, unpack_dir):
    """Extrait un .docx (ZIP) vers un dossier + pretty-print les XML (comme unpack.py)."""
    import defusedxml.minidom
    unpack_dir = Path(unpack_dir)
    unpack_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(docx_path, 'r') as zf:
        zf.extractall(unpack_dir)
    # Pretty-print les fichiers XML (reproduit le comportement de unpack.py original)
    for pattern in ['*.xml', '*.rels']:
        for xml_file in unpack_dir.rglob(pattern):
            try:
                with open(xml_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                dom = defusedxml.minidom.parseString(content)
                pretty = dom.toprettyxml(indent='  ')
                # Supprimer les lignes vides ajoutées par toprettyxml
                pretty = '\n'.join(line for line in pretty.split('\n') if line.strip())
                with open(xml_file, 'w', encoding='utf-8') as f:
                    f.write(pretty)
            except Exception:
                pass  # Ignorer les fichiers non-XML ou corrompus


def do_pack(unpack_dir, output_path):
    """Reconstruit un .docx (ZIP) à partir d'un dossier."""
    unpack_dir = Path(unpack_dir)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in unpack_dir.rglob('*'):
            if f.is_file():
                zf.write(f, f.relative_to(unpack_dir))

MODULE_ORDER = ["fab","biz","net","mag","vrp","col","log","jet","kub","flu"]
MODULE_TO_IMG = {"fab":"image1.png","biz":"image2.png","net":"image3.png","mag":"image4.png",
    "vrp":"image5.png","col":"image6.png","log":"image7.png","jet":"image8.png",
    "kub":"image9.png","flu":"image10.png"}
MOIS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août",
    "septembre","octobre","novembre","décembre"]

def fix_corners(src, dst, size=None):
    img = Image.open(src).convert('RGB')
    if size: img = img.resize(size, Image.LANCZOS)
    arr = np.array(img); h,w = arr.shape[:2]
    c = arr[2,2]; r,g,b = int(c[0]),int(c[1]),int(c[2])
    def flood(sy,sx,tol=50):
        stack=[(sy,sx)]; vis=set()
        while stack:
            y,x=stack.pop()
            if (y,x) in vis or not(0<=y<h and 0<=x<w): continue
            p=arr[y,x]
            if abs(int(p[0])-r)<tol and abs(int(p[1])-g)<tol and abs(int(p[2])-b)<tol:
                vis.add((y,x)); arr[y,x]=[255,255,255]
                stack+=[(y+1,x),(y-1,x),(y,x+1),(y,x-1)]
    flood(0,0); flood(0,w-1); flood(h-1,0); flood(h-1,w-1)
    Image.fromarray(arr,'RGB').save(dst)

def fix_logo_tw(src, dst):
    img = Image.open(src).convert('RGB'); arr = np.array(img); h,w = arr.shape[:2]
    arr = arr[2:h-2, 2:w-2]; h2,w2 = arr.shape[:2]
    for y in list(range(3))+list(range(h2-3,h2)):
        for x in range(w2):
            r,g,b=int(arr[y,x,0]),int(arr[y,x,1]),int(arr[y,x,2])
            if abs(r-g)<15 and abs(g-b)<15 and r<210: arr[y,x]=[255,255,255]
    for x in list(range(3))+list(range(w2-3,w2)):
        for y in range(h2):
            r,g,b=int(arr[y,x,0]),int(arr[y,x,1]),int(arr[y,x,2])
            if abs(r-g)<15 and abs(g-b)<15 and r<210: arr[y,x]=[255,255,255]
    Image.fromarray(arr,'RGB').save(dst)

def fmt(n):
    return f"{n:,.2f}".replace(",","\u202f").replace(".",",")+"\u00a0\u20ac"

def cell_hdr(txt,w,align="center",bg="003366"):
    return (f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>'
            f'<w:shd w:val="clear" w:color="auto" w:fill="{bg}"/></w:tcPr>'
            f'<w:p><w:pPr><w:jc w:val="{align}"/></w:pPr>'
            f'<w:r><w:rPr><w:color w:val="FFFFFF"/><w:b/><w:sz w:val="20"/></w:rPr>'
            f'<w:t>{txt}</w:t></w:r></w:p></w:tc>')

def cell_body(txt,w,align="left"):
    return (f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/></w:tcPr>'
            f'<w:p><w:pPr><w:jc w:val="{align}"/></w:pPr>'
            f'<w:r><w:rPr><w:sz w:val="20"/></w:rPr>'
            f'<w:t>{txt}</w:t></w:r></w:p></w:tc>')

def cell_empty(w,bg="D5E8F0"):
    return (f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>'
            f'<w:shd w:val="clear" w:color="auto" w:fill="{bg}"/></w:tcPr><w:p/></w:tc>')

def cell_total(txt,w,align="left",color="003366",bg="D5E8F0"):
    return (f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>'
            f'<w:shd w:val="clear" w:color="auto" w:fill="{bg}"/></w:tcPr>'
            f'<w:p><w:pPr><w:jc w:val="{align}"/></w:pPr>'
            f'<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="{color}"/></w:rPr>'
            f'<w:t>{txt}</w:t></w:r></w:p></w:tc>')

def row(*cells): return '<w:tr>'+''.join(cells)+'</w:tr>'

def tbl_wrap(rows_xml, cols="5000,2013,2013"):
    """Tableau avec tblInd=720 pour s'aligner sur les §3.x (Titre2)."""
    ws = cols.split(',')
    grid = ''.join(f'<w:gridCol w:w="{w}"/>' for w in ws)
    total = sum(int(w) for w in ws)
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{total}" w:type="dxa"/>'
            f'<w:tblInd w:w="720" w:type="dxa"/>'
            f'<w:tblBorders>'
            f'<w:top w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>'
            f'<w:left w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>'
            f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>'
            f'<w:right w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>'
            f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>'
            f'<w:insideV w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>'
            f'</w:tblBorders></w:tblPr>'
            f'<w:tblGrid>{grid}</w:tblGrid>{rows_xml}</w:tbl>')

def sep(pid):
    return (f'<w:p w14:paraId="{pid}" w14:textId="77777777" '
            f'w:rsidR="{pid}" w:rsidRDefault="{pid}"/>')


def generer_propale(data: dict, output_path: str, work_dir: Path):
    today   = date.today()
    date_fr = f"{today.day} {MOIS_FR[today.month-1]} {today.year}"
    annee   = str(today.year)
    mois    = f"{today.month:02d}"

    societe    = data["societe"]
    contact    = data.get("contact","")
    adresse    = data.get("adresse","")
    commercial = data.get("commercial","christian").lower()
    modules    = [m.lower() for m in data.get("modules_retenus",[])]
    nb         = len(modules)
    propale    = data.get("propale",{})
    abo        = propale.get("abonnements",{})
    prest      = propale.get("prestations",{})
    form       = propale.get("formation",{})
    ref        = f"{societe.replace(' ','')}_{annee}{mois}"

    # Préparer dossier
    unpack = work_dir / "unpacked"
    if unpack.exists(): shutil.rmtree(unpack)
    do_unpack(str(MASTER), str(unpack))
    media = unpack/"word"/"media"

    # Logos
    for mod,img in MODULE_TO_IMG.items():
        src = ASSETS/"modules"/f"{mod}.png"
        if src.exists(): fix_corners(str(src),str(media/img),size=(284,284))
    tw = ASSETS/"logo-texaswin.png"
    if tw.exists(): fix_logo_tw(str(tw),str(media/"image11.png"))

    # Supprimer bordure header
    for hdr in ["header1.xml","header2.xml"]:
        p = unpack/"word"/hdr
        if not p.exists(): continue
        with open(p) as f: h=f.read()
        h=h.replace('<w:pStyle w:val="En-tte"/>',
            '<w:pStyle w:val="En-tte"/><w:pBdr>'
            '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            '<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/></w:pBdr>')
        with open(p,'w') as f: f.write(h)

    # Agrandir le logo de la 1ère page (header2.xml = type "first")
    # Dimensions souhaitées : ~8 cm × 1.6 cm (ratio préservé du logo 319×68)
    # 1 cm = 360000 EMU
    _fix_logo_size(unpack/"word"/"header2.xml", cx=2880000, cy=614400)   # 8 cm × 1.7 cm
    # Logo des autres pages : rester discret
    _fix_logo_size(unpack/"word"/"header1.xml", cx=1080000, cy=230400)   # 3 cm × 0.64 cm

    # Fix pieds de page : inverser le contenu (actuellement template inversé)
    # footer2.xml = "first" = 1ère page → doit contenir adresse ASTI
    # footer1.xml = "default" = autres pages → doit contenir "Proposition [société] - page N"
    _write_footer_first(unpack/"word"/"footer2.xml")
    _write_footer_default(unpack/"word"/"footer1.xml", societe)

    doc = unpack/"word"/"document.xml"
    with open(doc) as f: content=f.read()

    # 1. Société
    content=content.replace('Soci\xe9t\xe9\xa0NOM SOCIETE',societe)

    # 2. Contact + adresse (SANS fonction)
    # NB: defusedxml.minidom convertit les entités &#xXXXX; en caractères Unicode bruts lors du pretty-print.
    # Donc on doit chercher les caractères Unicode directement (pas les entités numériques) pour que str.replace match.
    old_c='''<w:p w14:paraId="39243FEE" w14:textId="77777777" w:rsidR="00EE4216" w:rsidRPr="00F366B5" w:rsidRDefault="00EE4216" w:rsidP="00F366B5">
      <w:pPr>
        <w:pStyle w:val="CoordonnesSt"/>
        <w:spacing w:after="0"/>
        <w:ind w:left="5245"/>
        <w:rPr>
          <w:rFonts w:ascii="Poppins" w:hAnsi="Poppins"/>
        </w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Poppins" w:hAnsi="Poppins"/>
        </w:rPr>
        <w:t>A l\u2019attention de Nom Personne</w:t>
      </w:r>
    </w:p>'''
    new_c = (f'<w:p w14:paraId="39243FEE" w14:textId="77777777" w:rsidR="00EE4216" '
             f'w:rsidRPr="00F366B5" w:rsidRDefault="00EE4216" w:rsidP="00F366B5">\n'
             f'      <w:pPr><w:pStyle w:val="CoordonnesSt"/><w:spacing w:after="0"/>'
             f'<w:ind w:left="5245"/><w:rPr><w:rFonts w:ascii="Poppins" w:hAnsi="Poppins"/>'
             f'</w:rPr></w:pPr>\n'
             f'      <w:r><w:rPr><w:rFonts w:ascii="Poppins" w:hAnsi="Poppins"/></w:rPr>'
             f'<w:t>\u00c0 l\u2019attention de {contact}</w:t></w:r>\n'
             f'    </w:p>')
    if adresse:
        new_c += (f'\n    <w:p w14:paraId="39243FFE" w14:textId="77777777" w:rsidR="00EE4216" '
                  f'w:rsidRPr="00F366B5" w:rsidRDefault="00EE4216" w:rsidP="00F366B5">\n'
                  f'      <w:pPr><w:pStyle w:val="CoordonnesSt"/><w:spacing w:after="0"/>'
                  f'<w:ind w:left="5245"/><w:rPr><w:rFonts w:ascii="Poppins" w:hAnsi="Poppins"/>'
                  f'</w:rPr></w:pPr>\n'
                  f'      <w:r><w:rPr><w:rFonts w:ascii="Poppins" w:hAnsi="Poppins"/></w:rPr>'
                  f'<w:t>{adresse}</w:t></w:r>\n'
                  f'    </w:p>')
    # Fail-safe : si le bloc cherché n'est pas trouvé, on logge un warning (sera visible dans Cockpit/Grafana)
    # pour ne pas générer silencieusement une propale sans contact ni adresse.
    if old_c not in content:
        print("[WARN] Bloc contact/adresse introuvable dans le template. "
              "Le template Master_Propale.docx a peut-être été modifié. "
              "Contact + adresse NE SERONT PAS injectés dans la propale.",
              file=sys.stderr)
    content=content.replace(old_c,new_c)

    # 3. Date + référence
    content=content.replace('>2025<',f'>{date_fr}<')
    content=content.replace('>Master Propale<',f'>{ref}<')

    # 4. Commercial : supprimer les 2 paragraphes existants (Christian + Roger) et injecter le bon
    COMMERCIAUX = {
        "christian": {"nom": "Christian Daumer", "email": "c.daumer@texaswin.fr", "tel": "+33 6 13 73 15 54"},
        "roger":     {"nom": "Roger Niddam",     "email": "r.niddam@texaswin.fr", "tel": "+33 6 66 16 56 99"},
        "frederic":  {"nom": "Frédéric Anis",    "email": "f.anis@texaswin.fr",   "tel": "+33 6 07 57 03 64"},
    }
    # Normaliser la valeur reçue (gestion accents, capitalisation)
    commercial_key = commercial.lower().replace("é", "e").replace("è", "e").replace("ê", "e")
    if commercial_key not in COMMERCIAUX:
        commercial_key = "christian"  # fallback par défaut
    com = COMMERCIAUX[commercial_key]

    # Supprimer les deux paragraphes existants du template (ils contiennent r.niddam ou c.daumer)
    # On ne garde QUE celui qu'on reconstruit
    # Pattern : paragraphe entier contenant r.niddam ou c.daumer
    content = re.sub(
        r'<w:p\s[^>]*>(?:(?!</w:p>).)*?r\.niddam(?:(?!</w:p>).)*?</w:p>',
        '__COMMERCIAL_PLACEHOLDER__',
        content, count=1, flags=re.DOTALL
    )
    content = re.sub(
        r'<w:p\s[^>]*>(?:(?!</w:p>).)*?c\.daumer(?:(?!</w:p>).)*?</w:p>',
        '', content, count=1, flags=re.DOTALL
    )
    # Construire le nouveau paragraphe du commercial (même style que Roger)
    nouveau_para_commercial = _build_commercial_para(com)
    content = content.replace('__COMMERCIAL_PLACEHOLDER__', nouveau_para_commercial, 1)

    # 5. Singulier/pluriel
    p1='les modules suivants\xa0: ' if nb>1 else 'le module suivant\xa0: '
    p2='des modules propos\xe9s' if nb>1 else 'du module propos\xe9'
    content=re.sub(r'Notre proposition int[èe]gre </w:t>.*?<w:t xml:space="preserve">\xa0: </w:t>\n      </w:r>',
        f'Notre proposition intègre </w:t>\n      </w:r>\n      <w:r>\n        <w:t xml:space="preserve">{p1}</w:t>\n      </w:r>',
        content,flags=re.DOTALL)
    content=re.sub(r'<w:rPr>\s*<w:highlight w:val="yellow"/>\s*</w:rPr>\s*<w:t>du/des</w:t>.*?propos.*?</w:r>',
        f'<w:rPr/>\n        <w:t xml:space="preserve">{p2}</w:t>\n      </w:r>',content,flags=re.DOTALL)
    content=re.sub(r'\s*<w:highlight w:val="yellow"/>','',content)

    # 6. Tableau modules — filtrer + corriger grille fantôme
    idx=content.find('rId10'); tbl_s=content.rfind('<w:tbl>',0,idx); tbl_e=content.find('</w:tbl>',idx)+len('</w:tbl>')
    tbl=content[tbl_s:tbl_e]
    tbl=tbl.replace('<w:tblGrid><w:gridCol w:w="993"/><w:gridCol w:w="8646"/><w:gridCol w:w="142"/></w:tblGrid>',
                    '<w:tblGrid><w:gridCol w:w="993"/><w:gridCol w:w="8646"/></w:tblGrid>')
    tbl=tbl.replace('<w:gridSpan w:val="2"/>','')
    ft=tbl.find('<w:tr '); hdr2=tbl[:ft].replace('<w:tblStyle w:val="Grilledutableau"/>','')
    trs=[m.start() for m in re.finditer(r'<w:tr ',tbl)]; tres=[m.end() for m in re.finditer(r'</w:tr>',tbl)]
    rows_mod=[tbl[s:e] for s,e in zip(trs,tres)]; keep={i for i,m in enumerate(MODULE_ORDER) if m in modules}
    content=content[:tbl_s]+hdr2+''.join(r for i,r in enumerate(rows_mod) if i in keep)+'</w:tbl>'+content[tbl_e:]

    # 7. Tableau abonnements + prestations → après §3.1
    r_abo=row(cell_hdr("D\xe9signation",5000,"left"),cell_hdr("P\xe9riodicit\xe9",2013),cell_hdr("Montant HT",2013,"right"))
    for l in abo.get("lignes",[]): r_abo+=row(cell_body(l["nom"],5000),cell_body("Mensuel",2013,"center"),cell_body(fmt(l["montant"]),2013,"right"))
    r_abo+=row(cell_total("Total abonnement mensuel",5000,"left"),cell_total("Mensuel",2013,"center"),cell_total(fmt(abo.get("total_mensuel",0))+" HT",2013,"right"))

    r_prest=row(cell_hdr("Prestations initiales",5000,"left"),cell_hdr("Dur\xe9e",2013),cell_hdr("Montant HT",2013,"right"))
    for l in prest.get("lignes",[]): r_prest+=row(cell_body(l["nom"],5000),cell_body(l.get("duree",""),2013,"center"),cell_body(fmt(l["montant"]),2013,"right"))
    r_prest+=row(cell_total("Total prestations initiales",5000,"left"),cell_empty(2013),cell_total(fmt(prest.get("total",0))+" HT",2013,"right"))

    tbl_prix=tbl_wrap(r_abo)+sep("17110001")+tbl_wrap(r_prest)
    anchor_prix='<w:t>Logiciel et prestations initiales</w:t>\n      </w:r>\n    </w:p>\n    <w:p w14:paraId="1D60B454"'
    if anchor_prix in content:
        content=content.replace(anchor_prix,'<w:t>Logiciel et prestations initiales</w:t>\n      </w:r>\n    </w:p>\n    '+tbl_prix+'\n    <w:p w14:paraId="1D60B454"')

    # 8. Tableau formation → après §3.3 (bookmarkEnd id=1)
    if form.get("lignes"):
        cols_f="3500,1000,900,1000,900,1583"
        r_form=row(cell_hdr("Formation",3500,"left","7B5EA7"),cell_hdr("Dur\xe9e std",1000,"center","7B5EA7"),
            cell_hdr("Sessions",900,"center","7B5EA7"),cell_hdr("Jours total",1000,"center","7B5EA7"),
            cell_hdr("Max/session",900,"center","7B5EA7"),cell_hdr("Montant HT",1583,"right","7B5EA7"))
        for l in form["lignes"]:
            r_form+=row(cell_body(l["nom"],3500),
                cell_body(f"{l.get('jours_std',l.get('jours',''))} j",1000,"center"),
                cell_body(str(l.get("sessions",1)),900,"center"),
                cell_body(f"{l.get('jours_total',l.get('jours',''))} j",1000,"center"),
                cell_body(str(l.get("max_session",5)),900,"center"),
                cell_body(fmt(l["montant"]),1583,"right"))
        r_form+=row(cell_total("+ Frais Qualiopi (15%)",3500,"left","7B5EA7","F5F0FA"),
            cell_empty(1000,"F5F0FA"),cell_empty(900,"F5F0FA"),cell_empty(1000,"F5F0FA"),cell_empty(900,"F5F0FA"),
            cell_total(fmt(form.get("qualiopi",0)),1583,"right","7B5EA7","F5F0FA"))
        r_form+=row(cell_total("Total formation (Qualiopi inclus)",3500,"left","7B5EA7","EDE7F6"),
            cell_empty(1000,"EDE7F6"),cell_empty(900,"EDE7F6"),cell_empty(1000,"EDE7F6"),cell_empty(900,"EDE7F6"),
            cell_total(fmt(form.get("total",0))+" HT",1583,"right","7B5EA7","EDE7F6"))
        tbl_form=sep("17110002")+tbl_wrap(r_form,cols_f)
        anchor_form='<w:bookmarkEnd w:id="1"/>\n    <w:p w14:paraId="1A4BE0D4"'
        if anchor_form in content:
            content=content.replace(anchor_form,'<w:bookmarkEnd w:id="1"/>\n    '+tbl_form+'\n    <w:p w14:paraId="1A4BE0D4"')

    # 8bis. Supprimer la section "Développements complémentaires" (titre + paragraphes vides suivants)
    # et insérer un saut de page pour que la Formation commence sur une nouvelle page
    content = _remove_dev_complementaires_and_add_page_break(content)

    # 9. Sections Synthèse + Règlement → remplacer toute l'ancienne section Règlement
    content = _replace_synthese_reglement(content, abo, prest, form, data.get("matériel", data.get("materiel", {})))

    # 9b. Ajouter un espacement de 30pt AVANT le titre "Les 10 avantages pour votre entreprise"
    content = _add_spacing_before_les_10(content)

    # 10. Saut de page avant "ANNEXES : Présentation des modules proposés"
    content = _insert_page_break_before_annexes(content)

    with open(doc,'w') as f: f.write(content)
    do_pack(str(unpack), output_path)
    print(f"✅ Propale générée : {output_path}")
    return output_path


def _insert_page_break_before_annexes(content):
    """Insère un saut de page avant le paragraphe Titre1 'ANNEXES', en supprimant
    au passage le paragraphe Titre1 vide qui le précède (et qui causait une page blanche)."""
    import re as _re

    # Trouver le paragraphe ANNEXES
    pattern_annex = r'<w:p\s[^>]*>(?:(?!</w:p>).)*?<w:pStyle w:val="Titre1"/>(?:(?!</w:p>).)*?<w:t[^>]*>ANNEXES'
    m = _re.search(pattern_annex, content, flags=_re.DOTALL)
    if not m:
        return content
    idx_annex = m.start()

    # Chercher en arrière un paragraphe Titre1 VIDE (sans <w:t>) immédiatement avant
    # Pattern : <w:p ...><w:pPr><w:pStyle w:val="Titre1"/>...</w:pPr></w:p>
    # (pas de <w:r> avec du texte)
    look_back = content[max(0, idx_annex-800):idx_annex]
    # Chercher le dernier paragraphe avant ANNEXES qui est Titre1 et vide
    pattern_empty_titre1 = r'<w:p\s[^>]*>\s*<w:pPr>\s*<w:pStyle w:val="Titre1"/>(?:(?!</w:p>).)*?</w:pPr>\s*</w:p>'
    empty_matches = list(_re.finditer(pattern_empty_titre1, look_back, flags=_re.DOTALL))

    if empty_matches:
        last_empty = empty_matches[-1]
        # Position absolue de début du paragraphe vide
        start_empty = (idx_annex - 800 if idx_annex > 800 else 0) + last_empty.start()
        end_empty = (idx_annex - 800 if idx_annex > 800 else 0) + last_empty.end()
        # Supprimer le paragraphe vide + insérer le saut de page avant ANNEXES
        page_break = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
        return content[:start_empty] + page_break + content[end_empty:idx_annex] + content[idx_annex:]

    # Fallback : insérer juste avant ANNEXES (ancien comportement)
    page_break = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
    return content[:idx_annex] + page_break + content[idx_annex:]


def _remove_dev_complementaires_and_add_page_break(content):
    """Supprime le titre '§3.2 Développements complémentaires' et les paragraphes vides qui suivent,
    jusqu'au titre 'Formation'. Insère un saut de page à la place (Formation sur nouvelle page)."""
    import re as _re

    # Début : paragraphe Titre2 "Développements complémentaires"
    pattern_start = r'<w:p\s[^>]*>(?:(?!</w:p>).)*?<w:pStyle w:val="Titre2"/>(?:(?!</w:p>).)*?<w:t[^>]*>Développements complémentaires</w:t>(?:(?!</w:p>).)*?</w:p>'
    m_start = _re.search(pattern_start, content, flags=_re.DOTALL)
    if not m_start:
        return content

    # Fin : chercher le début exact du paragraphe <w:p ...> qui contient "Formation" en Titre2.
    # IMPORTANT : la regex "greedy jusqu'à Formation" peut matcher au début d'un paragraphe vide
    # auto-fermé qui précède (pas de </w:p> fermant donc le (?!</w:p>) traverse). Pour éviter ça,
    # on localise le <w:t>Formation</w:t> puis on remonte au <w:p début qui le contient.
    search_zone = content[m_start.end():]
    idx_form_text = search_zone.find('<w:t>Formation</w:t>')
    if idx_form_text == -1:
        # Essai avec xml:space="preserve"
        m_form = _re.search(r'<w:t[^>]*>Formation</w:t>', search_zone)
        if not m_form:
            return content
        idx_form_text = m_form.start()
    # Remonter au début du <w:p ...> qui contient ce <w:t>
    # Cherche le dernier "<w:p " (avec espace ou w14:) avant idx_form_text
    idx_p_start = search_zone.rfind('<w:p ', 0, idx_form_text)
    if idx_p_start == -1:
        return content

    start_idx = m_start.start()
    end_idx = m_start.end() + idx_p_start

    # Remplacer par un saut de page (Formation commencera sur nouvelle page)
    page_break = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
    return content[:start_idx] + page_break + content[end_idx:]


def _add_spacing_before_les_10(content):
    """Ajoute un espacement de 30pt (w:before="600") sur le paragraphe 'Les 10 avantages pour votre entreprise'.
    Le paragraphe a déjà un <w:pPr> — on injecte juste <w:spacing w:before="600"/> dedans.
    """
    import re as _re
    # Trouver le paragraphe complet contenant "Les 10 avantages pour votre entreprise"
    # pattern : début de <w:p>, avec son pPr, jusqu'à la fin </w:pPr>, puis le reste du paragraphe
    pattern = r'(<w:p\s[^>]*>)(\s*<w:pPr>)((?:(?!</w:pPr>).)*?)(</w:pPr>)((?:(?!</w:p>).)*?<w:t[^>]*>Les 10 avantages pour votre entreprise</w:t>(?:(?!</w:p>).)*?</w:p>)'
    m = _re.search(pattern, content, flags=_re.DOTALL)
    if not m:
        # Essai sans pPr existant (cas improbable)
        return content
    # Injecter <w:spacing w:before="600"/> dans le pPr (ou le remplacer s'il existe déjà)
    p_open, ppr_open, ppr_content, ppr_close, p_rest = m.groups()
    # Si un <w:spacing ...> existe déjà, on le modifie pour y ajouter w:before
    if '<w:spacing' in ppr_content:
        new_ppr_content = _re.sub(
            r'<w:spacing([^/]*)/>',
            lambda mm: f'<w:spacing{mm.group(1)} w:before="600"/>' if 'w:before=' not in mm.group(1) else _re.sub(r'w:before="\d+"', 'w:before="600"', mm.group(0)),
            ppr_content
        )
    else:
        # Sinon on ajoute un nouveau <w:spacing w:before="600"/>
        new_ppr_content = '<w:spacing w:before="600"/>' + ppr_content
    return content[:m.start()] + p_open + ppr_open + new_ppr_content + ppr_close + p_rest + content[m.end():]


# ── Helpers pour §4 Synthèse + §5 Règlement ──────────────────────────────

def _titre2(text):
    """Paragraphe Titre2 (bleu, gras)"""
    return (f'<w:p><w:pPr><w:pStyle w:val="Titre2"/></w:pPr>'
            f'<w:r><w:t xml:space="preserve">{_xml_escape(text)}</w:t></w:r></w:p>')

def _para_synthese(label, montant_str):
    """Ligne de synthèse avec tabulations : 'Label ........ X € H.T' (indentée sur titre 3.x)"""
    return (f'<w:p><w:pPr>'
            f'<w:ind w:left="720"/>'
            f'<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9000"/></w:tabs>'
            f'<w:spacing w:after="80"/>'
            f'</w:pPr>'
            f'<w:r><w:t xml:space="preserve">{_xml_escape(label)} </w:t></w:r>'
            f'<w:r><w:tab/></w:r>'
            f'<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> {_xml_escape(montant_str)} € H.T</w:t></w:r>'
            f'</w:p>')

def _xml_escape(s):
    """Échappe les caractères XML spéciaux : & < > ' "."""
    return (str(s).replace('&', '&amp;')
                  .replace('<', '&lt;')
                  .replace('>', '&gt;')
                  .replace("'", '&apos;')
                  .replace('"', '&quot;'))

def _row_reglement(label, texte):
    """Ligne du tableau Règlement : libellé bleu gras à gauche, texte noir à droite"""
    label_esc = _xml_escape(label)
    texte_esc = _xml_escape(texte)
    cell_label = (f'<w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/>'
                  f'<w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>'
                  f'</w:tcPr>'
                  f'<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>'
                  f'<w:r><w:rPr><w:b/><w:color w:val="003366"/><w:sz w:val="20"/></w:rPr>'
                  f'<w:t xml:space="preserve">{label_esc}</w:t></w:r></w:p></w:tc>')
    cell_text = (f'<w:tc><w:tcPr><w:tcW w:w="6200" w:type="dxa"/>'
                 f'<w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>'
                 f'</w:tcPr>'
                 f'<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>'
                 f'<w:r><w:rPr><w:sz w:val="20"/></w:rPr>'
                 f'<w:t xml:space="preserve">{texte_esc}</w:t></w:r></w:p></w:tc>')
    return f'<w:tr>{cell_label}{cell_text}</w:tr>'

def _tbl_reglement(rows_xml):
    """Tableau 2 colonnes sans bordure visible"""
    return (f'<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>'
            f'<w:tblInd w:w="720" w:type="dxa"/>'
            f'<w:tblBorders>'
            f'<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'<w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'</w:tblBorders></w:tblPr>'
            f'<w:tblGrid><w:gridCol w:w="2800"/><w:gridCol w:w="6200"/></w:tblGrid>'
            f'{rows_xml}</w:tbl>')

def _replace_synthese_reglement(content, abo, prest, form, materiel):
    """Remplace la section Règlement existante par Synthèse + nouveau Règlement."""
    import re as _re

    # ── Construire §4 Synthèse ──
    synthese_lines = []
    total_mensuel = abo.get("total_mensuel", 0)
    total_prest   = prest.get("total", 0)
    total_form    = form.get("total", 0) if form else 0
    total_mat     = materiel.get("total", 0) if isinstance(materiel, dict) else (materiel or 0)

    if total_mensuel > 0: synthese_lines.append(_para_synthese("Abonnement Mensuel", fmt_num(total_mensuel)))
    if total_prest   > 0: synthese_lines.append(_para_synthese("Prestation initiale", fmt_num(total_prest)))
    if total_form    > 0: synthese_lines.append(_para_synthese("Formations", fmt_num(total_form)))
    if total_mat     > 0: synthese_lines.append(_para_synthese("Matériel", fmt_num(total_mat)))

    synthese_xml = _titre2("Synthèse") + ''.join(synthese_lines)

    # ── Construire §5 Règlement (tableau 2 colonnes) ──
    reglement_data = [
        ("Acompte :",             "30 % du montant TTC des prestations initiales et matériel à la commande."),
        ("Matériel :",            "30 jours nets, date de facture, émise dès la réception du matériel. Nous pouvons également vous proposer une location financière de ces matériels sous réserve d'accord de notre partenaire GRENKE."),
        ("Solde prestations :",   "À la mise en service (TexasWin réputé en production)."),
        ("Délai de paiement :",   "30 jours nets, date de facture — virement bancaire ou prélèvement SEPA."),
        ("Hébergement :",         "L'hébergement sera facturé dès le déploiement des premières VM."),
        ("Abonnement :",          "Sans engagement de durée. Prélèvement le 6 du mois (mensuel) ou à date anniversaire (annuel)."),
        ("Révision tarifaire",    "Indexation annuelle possible au 1er janvier selon indice SYNTEC : P = P₀ × (S/S₀) × 1,005."),
        ("Hébergement & SLA",     "Hébergement France, datacenter Tier 3, sauvegardes quotidiennes. Disponibilité garantie 99,5 % mensuel."),
        ("Données & RGPD",        "Le client reste propriétaire de ses données. Hébergement en France. Export CSV possible à la résiliation."),
        ("CGV",                   "Les présentes conditions sont régies par les CGV TexasWin en vigueur (2026), disponibles sur pièce jointe."),
    ]
    rows = ''.join(_row_reglement(label, texte) for label, texte in reglement_data)
    reglement_xml = _titre2("Règlement") + _tbl_reglement(rows)

    # Saut de page après le tableau Règlement
    # Le spacing de 30pt AVANT "Les 10 avantages" sera appliqué directement sur ce titre
    # (via modification du w:pPr du paragraphe, après ce remplacement)
    page_break = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

    # ── Remplacer l'ancienne section ──
    # On cherche : début du <w:p Titre2 Règlement> jusqu'à début du <w:p Titre2 Les 10 avantages>
    # Après pretty-print, le XML est indenté. On cherche donc des motifs robustes.

    # Localiser le paragraphe qui contient "<w:t xml:space=\"preserve\">Règlement</w:t>" ou "<w:t>Règlement</w:t>"
    # en s'assurant qu'il a le style Titre2
    patterns_start = [
        r'<w:p\s[^>]*>(?:(?!</w:p>).)*?<w:pStyle w:val="Titre2"/>(?:(?!</w:p>).)*?<w:t[^>]*>Règlement</w:t>(?:(?!</w:p>).)*?</w:p>',
    ]
    patterns_end = [
        r'<w:p\s[^>]*>(?:(?!</w:p>).)*?<w:pStyle w:val="Titre2"/>(?:(?!</w:p>).)*?<w:t[^>]*>Les 10 avantages pour votre entreprise</w:t>',
    ]

    m_start = None
    for p in patterns_start:
        m_start = _re.search(p, content, flags=_re.DOTALL)
        if m_start: break
    m_end = None
    for p in patterns_end:
        m_end = _re.search(p, content, flags=_re.DOTALL)
        if m_end: break

    if not m_start or not m_end:
        print("⚠️  Impossible de localiser la section Règlement — ancienne version conservée")
        return content

    start_idx = m_start.start()
    end_idx = m_end.start()  # on garde le paragraphe "Les 10 avantages" intact

    # CRITIQUE : préserver les <w:sectPr>...</w:sectPr> qui sont dans la zone supprimée.
    # Ces blocs contiennent les <w:headerReference>/<w:footerReference> essentiels pour
    # que les en-têtes et pieds de page s'affichent. Sans eux, Word n'affiche rien.
    zone_removed = content[start_idx:end_idx]
    sect_prs = _re.findall(r'<w:sectPr[^>]*>.*?</w:sectPr>', zone_removed, flags=_re.DOTALL)
    # Réinjecter chaque sectPr dans un paragraphe invisible (nécessaire car sectPr doit être dans un w:pPr)
    preserved = ''
    for sp in sect_prs:
        preserved += f'<w:p><w:pPr>{sp}</w:pPr></w:p>'

    return content[:start_idx] + synthese_xml + reglement_xml + page_break + preserved + content[end_idx:]


def fmt_num(n):
    """Format '17 192,50' avec espace insécable (pas le symbole €)."""
    return f"{n:,.2f}".replace(",", "\u202f").replace(".", ",")


def _build_commercial_para(com):
    """Construit le paragraphe XML 'Votre interlocuteur : <Nom> | <email> | <tel>'"""
    nom = _xml_escape(com["nom"])
    email = _xml_escape(com["email"])
    tel = _xml_escape(com["tel"])
    return (f'<w:p><w:pPr><w:rPr><w:w w:val="90"/></w:rPr></w:pPr>'
            f'<w:r><w:rPr><w:w w:val="90"/></w:rPr>'
            f'<w:t xml:space="preserve">Votre interlocuteur : </w:t></w:r>'
            f'<w:r><w:rPr><w:w w:val="90"/></w:rPr>'
            f'<w:t xml:space="preserve">{nom} | {email} | {tel}</w:t></w:r>'
            f'</w:p>')


# ── Helpers pour redimensionner le logo et écrire les footers ────────────

def _fix_logo_size(header_path, cx, cy):
    """Met à jour les dimensions du logo (image drawing) dans un header."""
    import re as _re
    if not header_path.exists():
        return
    with open(header_path, encoding='utf-8') as f:
        content = f.read()
    # Chercher le bloc <wp:extent cx="..." cy="..."/> qui dimensionne l'image
    # et le bloc <a:ext cx="..." cy="..."/> dans graphicFrame (dimensions internes)
    content = _re.sub(
        r'<wp:extent cx="\d+" cy="\d+"/>',
        f'<wp:extent cx="{cx}" cy="{cy}"/>',
        content
    )
    content = _re.sub(
        r'<a:ext cx="\d+" cy="\d+"/>',
        f'<a:ext cx="{cx}" cy="{cy}"/>',
        content
    )
    with open(header_path, 'w', encoding='utf-8') as f:
        f.write(content)


def _write_footer_first(footer_path):
    """Footer de la 1ère page : adresse ASTI (discret, trois colonnes)."""
    xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:tbl>
    <w:tblPr>
      <w:tblW w:w="9638" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>
        <w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>
      <w:gridCol w:w="5400"/>
      <w:gridCol w:w="4238"/>
    </w:tblGrid>
    <w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="5400" w:type="dxa"/></w:tcPr>
        <w:p>
          <w:pPr><w:spacing w:after="0"/></w:pPr>
          <w:r><w:rPr><w:b/><w:color w:val="607a7a"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">TexasWin</w:t></w:r>
          <w:r><w:rPr><w:color w:val="607a7a"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve"> est développé par ASTI</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:spacing w:after="0"/></w:pPr>
          <w:r><w:rPr><w:color w:val="607a7a"/><w:sz w:val="18"/></w:rPr><w:t>www.texaswin.fr</w:t></w:r>
        </w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="4238" w:type="dxa"/></w:tcPr>
        <w:p>
          <w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr>
          <w:r><w:rPr><w:color w:val="607a7a"/><w:sz w:val="18"/></w:rPr><w:t>19 rue de la Résistance</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr>
          <w:r><w:rPr><w:color w:val="607a7a"/><w:sz w:val="18"/></w:rPr><w:t>42312 Roanne, France</w:t></w:r>
        </w:p>
      </w:tc>
    </w:tr>
  </w:tbl>
  <w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>
</w:ftr>'''
    with open(footer_path, 'w', encoding='utf-8') as f:
        f.write(xml)


def _write_footer_default(footer_path, societe):
    """Footer des pages suivantes : 'Proposition [société] - page N'."""
    societe_esc = _xml_escape(societe)
    xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs>
      <w:spacing w:after="0"/>
    </w:pPr>
    <w:r><w:rPr><w:color w:val="999999"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">Proposition {societe_esc}</w:t></w:r>
    <w:r><w:tab/></w:r>
    <w:r><w:rPr><w:color w:val="999999"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">page </w:t></w:r>
    <w:r><w:rPr><w:color w:val="999999"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:rPr><w:color w:val="999999"/><w:sz w:val="18"/></w:rPr><w:instrText>PAGE</w:instrText></w:r>
    <w:r><w:rPr><w:color w:val="999999"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>'''
    with open(footer_path, 'w', encoding='utf-8') as f:
        f.write(xml)


if __name__=="__main__":
    if len(sys.argv)<2:
        print("Usage: python generer_propale.py config.json [output.docx]")
        sys.exit(1)
    with open(sys.argv[1]) as f: data=json.load(f)
    societe_slug=data["societe"].replace(" ","")
    today=date.today()
    output=sys.argv[2] if len(sys.argv)>2 else f"propale_{societe_slug}_{today.year}{today.month:02d}.docx"
    work_dir=Path("/tmp/propale_work"); work_dir.mkdir(exist_ok=True)
    generer_propale(data,output,work_dir)
