
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

BASE = "https://www.philibertnet.com"
URL = BASE + "/fr/flash-sales"
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
    print("Collecte des promotions Philibert...")

    # Verifier les consignes techniques d'acces
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
            "Collecte non autorisee par robots.txt."
        )

    reponse = requests.get(
        URL,
        headers={"User-Agent": AGENT},
        timeout=20
    )
    reponse.raise_for_status()

    soup = BeautifulSoup(reponse.text, "html.parser")
    produits = soup.select(".product-card[data-pid]")

    print(f"Produits detectes : {len(produits)}")

    offres = []
    identifiants_vus = set()
    date_collecte = datetime.now(timezone.utc).isoformat()

    for produit in produits:
        identifiant = produit.get("data-pid")

        if not identifiant or identifiant in identifiants_vus:
            continue

        titre = produit.select_one("a.product-card__title")
        prix = produit.select_one(".product-card__price")
        ancien = produit.select_one(".product-card__price--old")
        image = produit.select_one("img.product-card__thumb")

        if not titre or not prix or not ancien:
            continue

        try:
            prix_actuel = convertir_prix(texte(prix))
            prix_initial = convertir_prix(texte(ancien))
        except (ValueError, TypeError):
            continue

        if prix_actuel <= 0 or prix_initial <= prix_actuel:
            continue

        lien = titre.get("href", "")
        if not lien:
            continue

        identifiants_vus.add(identifiant)

        offres.append({
            "id": f"philibert-{identifiant}",
            "nom": texte(titre),
            "boutique": "Philibert",
            "prix": prix_actuel,
            "ancien": prix_initial,
            "reduction": round(
                (1 - prix_actuel / prix_initial) * 100
            ),
            "image": urljoin(
                BASE,
                image.get("src", "")
            ) if image else "",
            "url": urljoin(BASE, lien),
            "stock": "",
            "dateCollecte": date_collecte
        })

    if not offres:
        raise RuntimeError(
            "Aucune promotion Philibert trouvee. "
            "Fichier precedent conserve."
        )

    # Lire les promotions deja presentes
    anciennes_offres = []

    if SORTIE.exists():
        anciennes_offres = json.loads(
            SORTIE.read_text(encoding="utf-8")
        )

    if not isinstance(anciennes_offres, list):
        raise RuntimeError(
            "Format du fichier JSON incorrect."
        )

    anciennes_philibert = [
        offre for offre in anciennes_offres
        if offre.get("boutique") == "Philibert"
    ]

    # Eviter un remplacement par une collecte incomplete
    if (
        anciennes_philibert
        and len(offres) < len(anciennes_philibert) * 0.5
    ):
        raise RuntimeError(
            "Baisse anormale des offres Philibert. "
            "Fichier precedent conserve."
        )

    # Conserver les offres Ludifolie et des autres boutiques
    autres_boutiques = [
        offre for offre in anciennes_offres
        if offre.get("boutique") != "Philibert"
    ]

    toutes_les_offres = autres_boutiques + offres

    # Enregistrer sans ecraser les autres boutiques
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

    print()
    print(f"Promotions Philibert : {len(offres)}")
    print(f"Autres boutiques conservees : {len(autres_boutiques)}")
    print(f"Total LudiRadar : {len(toutes_les_offres)}")

    print()
    print("--- PREMIERES PROMOTIONS PHILIBERT ---")

    for offre in offres[:5]:
        print(
            f"{offre['nom']} | "
            f"{offre['prix']:.2f} EUR | "
            f"-{offre['reduction']} %"
        )


if __name__ == "__main__":
    collecter()
