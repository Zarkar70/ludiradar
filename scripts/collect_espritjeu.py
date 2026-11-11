
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup


BASE = "https://www.espritjeu.com"
URL = BASE + "/promotions.html"
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

    correspondance = re.search(
        r"\d+(?:\.\d+)?",
        valeur
    )

    if not correspondance:
        raise ValueError("Prix invalide")

    return float(correspondance.group())


def texte(element):
    return element.get_text(" ", strip=True) if element else ""


def collecter():
    print("Collecte des promotions Esprit Jeu...")

    robots = RobotFileParser()
    robots.set_url(BASE + "/robots.txt")
    robots.read()

    if not robots.can_fetch(AGENT, URL):
        raise RuntimeError(
            "Collecte Esprit Jeu interdite par robots.txt"
        )

    response = requests.get(
        URL,
        headers={"User-Agent": AGENT},
        timeout=20
    )
    response.raise_for_status()

    soup = BeautifulSoup(
        response.text,
        "html.parser"
    )

    produits = soup.select(".product_box")

    print(f"Produits detectes : {len(produits)}")

    offres = []
    identifiants = set()

    date_collecte = datetime.now(
        timezone.utc
    ).isoformat()

    for produit in produits:
        bloc = produit.select_one(
            ".bp_content[idproduit]"
        )

        titre = produit.select_one(
            ".bp_designation a[href]"
        )

        prix_bloc = produit.select_one(
            ".bp_prix"
        )

        ancien_element = produit.select_one(
            ".barrer_prix"
        )

        image = produit.select_one(
            ".bp_image img"
        )

        if not all([
            bloc,
            titre,
            prix_bloc,
            ancien_element
        ]):
            continue

        identifiant = bloc.get("idproduit")

        if not identifiant:
            continue

        if identifiant in identifiants:
            continue

        prix_actuel_element = prix_bloc.select_one(
            ".d-inline-block"
        )

        if not prix_actuel_element:
            continue

        try:
            prix_actuel = convertir_prix(
                texte(prix_actuel_element)
            )

            prix_initial = convertir_prix(
                texte(ancien_element)
            )

        except (ValueError, TypeError):
            continue

        if prix_actuel <= 0:
            continue

        if prix_initial <= prix_actuel:
            continue

        reduction = round(
            (1 - prix_actuel / prix_initial) * 100
        )

        nom = texte(titre)

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

        if not nom or not lien:
            continue

        identifiants.add(identifiant)

        offres.append({
            "id": f"espritjeu-{identifiant}",
            "nom": nom,
            "boutique": "Esprit Jeu",
            "prix": prix_actuel,
            "ancien": prix_initial,
            "reduction": reduction,
            "image": image_url,
            "url": lien,
            "stock": "",
            "dateCollecte": date_collecte
        })

    if not offres:
        raise RuntimeError(
            "Aucune promotion Esprit Jeu trouvee. "
            "Anciennes donnees conservees."
        )

    # Lire les promotions existantes
    anciennes_offres = []

    if SORTIE.exists():
        anciennes_offres = json.loads(
            SORTIE.read_text(encoding="utf-8")
        )

        if not isinstance(anciennes_offres, list):
            raise RuntimeError(
                "Le fichier promotions.json est invalide."
            )

    # Protection contre une baisse anormale
    anciennes_espritjeu = [
        offre for offre in anciennes_offres
        if offre.get("boutique") == "Esprit Jeu"
    ]

    if (
        anciennes_espritjeu
        and len(offres) < len(anciennes_espritjeu) * 0.5
    ):
        raise RuntimeError(
            "Baisse anormale des promotions Esprit Jeu. "
            "Anciennes donnees conservees."
        )

    # Conserver les autres boutiques
    autres_boutiques = [
        offre for offre in anciennes_offres
        if offre.get("boutique") != "Esprit Jeu"
    ]

    toutes_offres = autres_boutiques + offres

    # Enregistrement securise
    SORTIE.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    temporaire = SORTIE.with_suffix(".tmp")

    temporaire.write_text(
        json.dumps(
            toutes_offres,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )

    temporaire.replace(SORTIE)

    print()
    print(f"Promotions Esprit Jeu : {len(offres)}")
    print(f"Autres boutiques conservees : {len(autres_boutiques)}")
    print(f"Total LudiRadar : {len(toutes_offres)}")

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
