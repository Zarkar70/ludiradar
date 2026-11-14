"""Prépare un cache de fiches de jeux sans inventer de métadonnées.

Lancer après les collecteurs : python scripts/enrichir_jeux.py
"""
import json
import os
import re
import tempfile
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMOTIONS = ROOT / 'public' / 'promotions.json'
DETAILS = ROOT / 'public' / 'jeux-details.json'


def normaliser(nom):
    texte = unicodedata.normalize('NFKD', nom.casefold())
    texte = ''.join(c for c in texte if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', texte).strip('-')


def main():
    offres = json.loads(PROMOTIONS.read_text(encoding='utf-8'))
    if not isinstance(offres, list):
        raise ValueError('promotions.json doit contenir une liste')
    ancien = {}
    if DETAILS.exists():
        ancien = json.loads(DETAILS.read_text(encoding='utf-8'))
        if not isinstance(ancien, dict):
            raise ValueError('jeux-details.json doit contenir un objet')
    resultat = dict(ancien)  # Préserver les fiches enrichies, même sans promotion actuelle.
    nouveaux = 0
    for offre in offres:
        if not isinstance(offre, dict):
            continue
        nom = offre.get('nom')
        if not isinstance(nom, str) or not nom.strip():
            continue
        cle = normaliser(nom)
        if not cle:
            continue
        if cle not in resultat:
            resultat[cle] = {
                'nom': nom.strip(),
                'joueursMin': None,
                'joueursMax': None,
                'dureeMinutes': None,
                'ageMinimum': None,
                'description': '',
                'categories': [],
                'auteurs': [],
                'editeur': '',
                'ean': '',
                'source': '',
                'dateEnrichissement': None,
            }
            nouveaux += 1
    DETAILS.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.jeux-details-', suffix='.tmp', dir=DETAILS.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as fichier:
            json.dump(resultat, fichier, ensure_ascii=False, indent=2, sort_keys=True)
            fichier.write('\n')
        os.replace(tmp, DETAILS)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    print(f'{len(resultat)} fiches, dont {nouveaux} nouvelles. Métadonnées inconnues laissées vides.')


if __name__ == '__main__':
    main()
