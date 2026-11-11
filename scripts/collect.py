
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

BASE = "https://www.ludifolie.com"
URL = BASE + "/202-promotions-jeux-de-societe"
AGENT = "LudiRadar/0.1"
SORTIE = Path(__file__).resolve().parents[1] / "public" / "promotions.json"


def convertir_prix(texte):
    texte = texte.replace("\u202f", "").replace("\xa0", "")
    texte = texte.replace(" ", "").replace("€", "")
    texte = texte.replace(",", ".")
    return float(texte)


def texte(element):
    return element.get_text(" ", strip=True) if element else ""


def collecter():
    robots = RobotFileParser()
    robots.set_url(BASE + "/robots.txt")

    try:
        robots.read()
    except Exception as erreur:
        raise RuntimeError(
            f"Vérification robots.txt impossible : {erreur}"
        )

    if not robots.can_fetch(AGENT, URL):
        raise RuntimeError("Collecte non autorisée pour cette page.")

    response = requests.get(
        URL,
        timeout=20,
        headers={"User-Agent": AGENT}
    )
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    produits = soup.select("article.product-miniature")

    offres = []

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
        except ValueError:
            continue

        if prix_initial <= prix_actuel or prix_actuel <= 0:
            continue

        reduction = round(
            (1 - prix_actuel / prix_initial) * 100
        )

        identifiant = produit.get("data-id-product")

        offres.append({
            "id": f"ludifolie-{identifiant}",
            "nom": texte(titre),
            "boutique": "Ludifolie",
            "prix": prix_actuel,
            "ancien": prix_initial,
            "reduction": reduction,
            "image": image.get("src", "") if image else "",
            "url": titre.get("href", ""),
            "stock": texte(stock),
            "dateCollecte": datetime.now(
                timezone.utc
            ).isoformat()
        })

    if not offres:
        raise RuntimeError(
            "Aucune promotion trouvée. Fichier précédent conservé."
        )

    SORTIE.parent.mkdir(parents=True, exist_ok=True)

    temporaire = SORTIE.with_suffix(".tmp")
    temporaire.write_text(
        json.dumps(offres, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    temporaire.replace(SORTIE)

    print(f"Promotions enregistrées : {len(offres)}")
    print(f"Fichier créé : {SORTIE}")

    for offre in offres[:5]:
        print(
            f"{offre['nom']} | "
            f"{offre['prix']:.2f} € | "
            f"-{offre['reduction']} %"
        )


if __name__ == "__main__":
    collecter()
