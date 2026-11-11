
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
    if element:
        return element.get_text(" ", strip=True)
    return ""


def collecter():
    print("Demarrage de la collecte LudiRadar...")

    # Verifier robots.txt
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

    # Telecharger la page
    response = requests.get(
        URL,
        timeout=20,
        headers={"User-Agent": AGENT}
    )
    response.raise_for_status()

    # Analyser les produits
    soup = BeautifulSoup(response.text, "html.parser")
    produits = soup.select("article.product-miniature")

    print(f"Produits detectes : {len(produits)}")

    offres = []
    identifiants_vus = set()

    for produit in produits:
        titre = produit.select_one(
            ".product-miniature__title"
        )
        prix = produit.select_one(
            ".product-miniature__price"
        )
        ancien = produit.select_one(
            ".product-miniature__regular-price"
        )
        image = produit.select_one(
            ".product-miniature__image"
        )
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

        reduction = round(
            (1 - prix_actuel / prix_initial) * 100
        )

        identifiant = produit.get("data-id-product")

        if not identifiant:
            continue

        if identifiant in identifiants_vus:
            continue

        identifiants_vus.add(identifiant)

        lien = urljoin(
            BASE,
            titre.get("href", "")
        )

        image_url = ""
        if image:
            image_url = urljoin(
                BASE,
                image.get("src", "")
            )

        offres.append({
            "id": f"ludifolie-{identifiant}",
            "nom": texte(titre),
            "boutique": "Ludifolie",
            "prix": prix_actuel,
            "ancien": prix_initial,
            "reduction": reduction,
            "image": image_url,
            "url": lien,
            "stock": texte(stock),
            "dateCollecte": datetime.now(
                timezone.utc
            ).isoformat()
        })

    # Proteger les donnees
    if not offres:
        raise RuntimeError(
            "Aucune promotion trouvee. "
            "Ancien fichier conserve."
        )

    if SORTIE.exists():
        anciennes_offres = json.loads(
            SORTIE.read_text(encoding="utf-8")
        )

        if (
            anciennes_offres
            and len(offres) < len(anciennes_offres) * 0.5
        ):
            raise RuntimeError(
                "Baisse anormale du nombre de promotions. "
                "Ancien fichier conserve."
            )

    # Enregistrer les promotions
    SORTIE.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    temporaire = SORTIE.with_suffix(".tmp")

    temporaire.write_text(
        json.dumps(
            offres,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )

    temporaire.replace(SORTIE)

    print()
    print(f"Promotions enregistrees : {len(offres)}")
    print(f"Fichier cree : {SORTIE}")
    print()
    print("--- PREMIERES PROMOTIONS ---")

    for offre in offres[:5]:
        print(
            f"{offre['nom']} | "
            f"{offre['prix']:.2f} EUR | "
            f"-{offre['reduction']} %"
        )


if __name__ == "__main__":
    collecter()
