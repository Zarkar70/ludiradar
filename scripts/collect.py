
import json
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup


BASE = "https://www.ludifolie.com"
URL = BASE + "/202-promotions-jeux-de-societe"
AGENT = "LudiRadar/0.1"
BOUTIQUE = "Ludifolie"

SORTIE = (
    Path(__file__).resolve().parents[1]
    / "public"
    / "promotions.json"
)


def convertir_prix(valeur):
    valeur = (
        valeur.replace("\u202f", "")
        .replace("\xa0", "")
        .replace(" ", "")
        .replace("€", "")
        .replace(",", ".")
    )

    resultat = re.search(r"\d+(?:\.\d+)?", valeur)

    if not resultat:
        raise ValueError("Prix invalide")

    return float(resultat.group())


def texte(element):
    return element.get_text(" ", strip=True) if element else ""


def extraire_produits(soup, date_collecte):
    offres = []

    for produit in soup.select("article.product-miniature"):
        identifiant = produit.get("data-id-product")

        titre = produit.select_one(
            ".product-miniature__title"
        )

        prix_element = produit.select_one(
            ".product-miniature__price"
        )

        ancien_element = produit.select_one(
            ".product-miniature__regular-price"
        )

        image = produit.select_one(
            ".product-miniature__image img"
        )

        if not all([
            identifiant,
            titre,
            prix_element,
            ancien_element
        ]):
            continue

        try:
            prix = convertir_prix(
                texte(prix_element)
            )

            ancien = convertir_prix(
                texte(ancien_element)
            )

        except (ValueError, TypeError):
            continue

        if prix <= 0 or ancien <= prix:
            continue

        nom = texte(titre)

        lien = urljoin(
            BASE,
            titre.get("href", "")
        )

        if not nom or not titre.get("href"):
            continue

        image_url = ""

        if image:
            source = (
                image.get("data-src")
                or image.get("src")
                or ""
            )

            image_url = urljoin(BASE, source)

        reduction = round(
            (1 - prix / ancien) * 100
        )

        offres.append({
            "id": f"ludifolie-{identifiant}",
            "nom": nom,
            "boutique": BOUTIQUE,
            "prix": prix,
            "ancien": ancien,
            "reduction": reduction,
            "image": image_url,
            "url": lien,
            "stock": "",
            "dateCollecte": date_collecte
        })

    return offres


def collecter():
    print("=== COLLECTE LUDIFOLIE ===")

    robots = RobotFileParser()
    robots.set_url(BASE + "/robots.txt")
    robots.read()

    if not robots.can_fetch(AGENT, URL):
        raise RuntimeError(
            "Collecte interdite par robots.txt"
        )

    session = requests.Session()
    session.headers.update({
        "User-Agent": AGENT
    })

    date_collecte = datetime.now(
        timezone.utc
    ).isoformat()

    offres_par_id = {}
    ids_tous_produits = set()
    signatures_pages = set()

    # Charger la premiere page
    response = session.get(URL, timeout=25)
    response.raise_for_status()

    soup = BeautifulSoup(
        response.text,
        "html.parser"
    )

    compteur = soup.select_one(
        ".pagination__number"
    )

    if not compteur:
        raise RuntimeError(
            "Compteur de pagination introuvable"
        )

    correspondance = re.search(
        r"de\s+(\d+)\s+article",
        texte(compteur),
        flags=re.IGNORECASE
    )

    if not correspondance:
        raise RuntimeError(
            "Nombre total de produits introuvable"
        )

    total_annonce = int(
        correspondance.group(1)
    )

    produits_premiere_page = soup.select(
        "article.product-miniature"
    )

    if not produits_premiere_page:
        raise RuntimeError(
            "Aucun produit detecte"
        )

    produits_par_page = len(
        produits_premiere_page
    )

    total_pages = math.ceil(
        total_annonce / produits_par_page
    )

    print(f"Produits annonces : {total_annonce}")
    print(f"Pages a parcourir : {total_pages}")

    for page in range(1, total_pages + 1):
        if page > 1:
            time.sleep(1.5)

            url_page = f"{URL}?page={page}"

            if not robots.can_fetch(
                AGENT,
                url_page
            ):
                raise RuntimeError(
                    f"Page {page} interdite par robots.txt"
                )

            response = session.get(
                url_page,
                timeout=25
            )

            response.raise_for_status()

            soup = BeautifulSoup(
                response.text,
                "html.parser"
            )

        produits = soup.select(
            "article.product-miniature"
        )

        if not produits:
            raise RuntimeError(
                f"Page {page} vide. "
                "Anciennes donnees conservees."
            )

        ids_page = tuple(
            produit.get("data-id-product")
            for produit in produits
        )

        if ids_page in signatures_pages:
            raise RuntimeError(
                f"Page {page} repetee. "
                "Anciennes donnees conservees."
            )

        signatures_pages.add(ids_page)

        for identifiant in ids_page:
            if identifiant:
                ids_tous_produits.add(identifiant)

        offres_page = extraire_produits(
            soup,
            date_collecte
        )

        for offre in offres_page:
            offres_par_id[offre["id"]] = offre

        print(
            f"Page {page}/{total_pages} : "
            f"{len(produits)} produits, "
            f"{len(offres_page)} promotions valides, "
            f"{len(offres_par_id)} offres uniques"
        )

    if len(ids_tous_produits) != total_annonce:
        raise RuntimeError(
            f"Collecte incomplete : "
            f"{len(ids_tous_produits)}/{total_annonce} "
            "produits uniques. "
            "Anciennes donnees conservees."
        )

    offres = list(
        offres_par_id.values()
    )

    if not offres:
        raise RuntimeError(
            "Aucune promotion valide"
        )

    # Conserver les autres boutiques
    anciennes_offres = []

    if SORTIE.exists():
        anciennes_offres = json.loads(
            SORTIE.read_text(encoding="utf-8")
        )

        if not isinstance(anciennes_offres, list):
            raise RuntimeError(
                "Format JSON invalide"
            )

    anciennes_ludifolie = [
        offre for offre in anciennes_offres
        if offre.get("boutique") == BOUTIQUE
    ]

    if (
        anciennes_ludifolie
        and len(offres) < len(anciennes_ludifolie) * 0.5
    ):
        raise RuntimeError(
            "Baisse anormale des promotions. "
            "Anciennes donnees conservees."
        )

    autres_boutiques = [
        offre for offre in anciennes_offres
        if offre.get("boutique") != BOUTIQUE
    ]

    toutes_offres = autres_boutiques + offres

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
    print("=== RESULTAT FINAL ===")
    print(f"Promotions Ludifolie : {len(offres)}")
    print(f"Autres boutiques conservees : {len(autres_boutiques)}")
    print(f"Total LudiRadar : {len(toutes_offres)}")

    print()
    print("=== EXEMPLES ===")

    for offre in offres[:5]:
        print(
            f"{offre['nom']} | "
            f"{offre['prix']:.2f} EUR | "
            f"-{offre['reduction']} %"
        )


if __name__ == "__main__":
    collecter()
