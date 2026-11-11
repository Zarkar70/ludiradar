
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.robotparser import RobotFileParser
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE = "https://www.ludifolie.com"
URL = BASE + "/202-promotions-jeux-de-societe"
AGENT = "LudiRadar/0.1"

SORTIE = (
    Path(__file__).resolve().parents[1]
    / "public"
    / "promotions.json"
)


def convertir_prix(valeur):
    valeur = valeur.replace("\u202f", "")
    valeur = valeur.replace("\xa0", "")
    valeur = valeur.replace(" ", "")
    valeur = valeur.replace("€", "")
    valeur = valeur.replace(",", ".")
    return float(valeur)


def texte(element):
    return element.get_text(" ", strip=True) if element else ""


def collecter():
    print("Collecte des promotions Ludifolie...")

    robots = RobotFileParser()
    robots.set_url(BASE + "/robots.txt")

    try:
        robots.read()
    except Exception as erreur:
        raise RuntimeError(
            f"Verification robots.txt impossible : {erreur}"
        )

    if not robots.can_fetch(AGENT, URL):
        raise RuntimeError(
            "Collecte non autorisee pour cette page."
        )

    response = requests.get(
        URL,
        timeout=20,
        headers={"User-Agent": AGENT}
    )
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    produits = soup.select("article.product-miniature")

    offres = []
    identifiants_vus = set()
    date_collecte = datetime.now(timezone.utc).isoformat()

    for produit in produits:
        titre = produit.select_one(".product-miniature__title")
        prix = produit.select_one(".product-miniature__price")
        ancien = produit.select_one(
            ".product-miniature__regular-price"
        )
        image = produit.select_one(".product-miniature__image")
        stock = produit.select_one(
            ".product-miniature__stock-label"
        )

        if not titre or not prix or not ancien:
            continue

        try:
            prix_actuel = convertir_prix(texte(prix))
            prix_initial = convertir_prix(texte(ancien))
        except (ValueError, TypeError):
            continue

        if prix_actuel <= 0 or prix_initial <= prix_actuel:
            continue

        identifiant = produit.get("data-id-product")

        if not identifiant or identifiant in identifiants_vus:
            continue

        identifiants_vus.add(identifiant)

        offres.append({
            "id": f"ludifolie-{identifiant}",
            "nom": texte(titre),
            "boutique": "Ludifolie",
            "prix": prix_actuel,
            "ancien": prix_initial,
            "reduction": round(
                (1 - prix_actuel / prix_initial) * 100
            ),
            "image": urljoin(
                BASE,
                image.get("src", "")
            ) if image else "",
            "url": urljoin(
                BASE,
                titre.get("href", "")
            ),
            "stock": texte(stock),
            "dateCollecte": date_collecte
        })

    if not offres:
        raise RuntimeError(
            "Aucune promotion Ludifolie trouvee. "
            "Fichier precedent conserve."
        )

    # Charger les promotions deja enregistrees
    anciennes_offres = []

    if SORTIE.exists():
        anciennes_offres = json.loads(
            SORTIE.read_text(encoding="utf-8")
        )

    if not isinstance(anciennes_offres, list):
        raise RuntimeError("Format JSON existant incorrect.")

    anciennes_ludifolie = [
        offre for offre in anciennes_offres
        if offre.get("boutique") == "Ludifolie"
    ]

    # Eviter un remplacement en cas de collecte incomplete
    if (
        anciennes_ludifolie
        and len(offres) < len(anciennes_ludifolie) * 0.5
    ):
        raise RuntimeError(
            "Baisse anormale des promotions Ludifolie. "
            "Fichier precedent conserve."
        )

    # Conserver les offres des autres boutiques
    autres_boutiques = [
        offre for offre in anciennes_offres
        if offre.get("boutique") != "Ludifolie"
    ]

    toutes_les_offres = offres + autres_boutiques

    SORTIE.parent.mkdir(parents=True, exist_ok=True)

    temporaire = SORTIE.with_suffix(".tmp")
    temporaire.write_text(
        json.dumps(
            toutes_les_offres,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )
    temporaire.replace(SORTIE)

    print(f"Promotions Ludifolie : {len(offres)}")
    print(f"Autres boutiques conservees : {len(autres_boutiques)}")
    print(f"Total LudiRadar : {len(toutes_les_offres)}")


if __name__ == "__main__":
    collecter()
