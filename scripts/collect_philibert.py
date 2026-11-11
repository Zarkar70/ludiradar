
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


BASE = "https://www.philibertnet.com"
URL = BASE + "/fr/flash-sales/"
AGENT = "LudiRadar/0.1"
BOUTIQUE = "Philibert"

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

    for produit in soup.select(".product-card[data-pid]"):
        identifiant = produit.get("data-pid")

        titre = produit.select_one(
            ".product-card__title"
        )

        prix_element = produit.select_one(
            ".product-card__price:not(.product-card__price--old)"
        )

        ancien_element = produit.select_one(
            ".product-card__price--old"
        )

        image = produit.select_one(
            ".product-card__thumb img, img.product-card__thumb"
        )

        if not all([
            identifiant,
            titre,
            prix_element,
            ancien_element
        ]):
            continue

        try:
            prix = convertir_prix(texte(prix_element))
            ancien = convertir_prix(texte(ancien_element))

        except (ValueError, TypeError):
            continue

        if prix <= 0 or ancien <= prix:
            continue

        lien_element = titre.select_one("a[href]")

        if lien_element:
            lien_source = lien_element.get("href", "")
        elif titre.name == "a":
            lien_source = titre.get("href", "")
        else:
            lien_source = ""

        if not lien_source:
            # Chercher le lien produit dans la fiche
            for a in produit.select("a[href]"):
                href = a.get("href", "")
                if href.startswith("/fr/") and href.endswith(".html"):
                    lien_source = href
                    break

        if not lien_source:
            continue

        nom = texte(titre)
        lien = urljoin(BASE, lien_source)

        if not nom:
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
            "id": f"philibert-{identifiant}",
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
    print("=== COLLECTE PHILIBERT ===")

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

    # Premiere page
    response = session.get(URL, timeout=25)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # Detecter le nombre de pages
    pages = [1]

    for a in soup.select("a[href]"):
        href = a.get("href", "")
        correspondance = re.search(
            r"[?&]p=(\d+)",
            href
        )
        if correspondance and "flash-sales" in href:
            pages.append(int(correspondance.group(1)))

    total_pages = max(pages)

    if total_pages < 1 or total_pages > 100:
        raise RuntimeError(
            "Nombre de pages invalide"
        )

    print(f"Pages detectees : {total_pages}")

    for page in range(1, total_pages + 1):
        if page > 1:
            time.sleep(1.5)

            url_page = f"{URL}?p={page}"

            if not robots.can_fetch(AGENT, url_page):
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
            ".product-card[data-pid]"
        )

        if not produits:
            raise RuntimeError(
                f"Page {page} vide. "
                "Anciennes donnees conservees."
            )

        ids_page = tuple(
            produit.get("data-pid")
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

    offres = list(offres_par_id.values())

    if not offres:
        raise RuntimeError(
            "Aucune promotion valide. "
            "Anciennes donnees conservees."
        )

    # Controle de coherence :
    # la plupart des fiches doivent etre exploitables.
    if len(offres) < len(ids_tous_produits) * 0.8:
        raise RuntimeError(
            f"Seulement {len(offres)} offres sur "
            f"{len(ids_tous_produits)} produits. "
            "Verifier les selecteurs HTML. "
            "Anciennes donnees conservees."
        )

    anciennes_offres = []

    if SORTIE.exists():
        anciennes_offres = json.loads(
            SORTIE.read_text(encoding="utf-8")
        )

        if not isinstance(anciennes_offres, list):
            raise RuntimeError(
                "Format JSON invalide"
            )

    anciennes_philibert = [
        offre for offre in anciennes_offres
        if offre.get("boutique") == BOUTIQUE
    ]

    if (
        anciennes_philibert
        and len(offres) < len(anciennes_philibert) * 0.5
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
    print(f"Produits uniques detectes : {len(ids_tous_produits)}")
    print(f"Promotions Philibert : {len(offres)}")
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
