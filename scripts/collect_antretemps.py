
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


BASE = "https://www.antretemps.com"
URL = BASE + "/promotions-jeux-de-societe-m63044.html"
AGENT = "LudiRadar/0.1"
BOUTIQUE = "L'Antre Temps"

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

    for produit in soup.select(".product_box"):
        bloc = produit.select_one(".bp_content[idproduit]")
        titre = produit.select_one(".bp_designation a[href]")
        prix_bloc = produit.select_one(".bp_prix")
        ancien = produit.select_one(".barrer_prix")
        image = produit.select_one(".bp_image img")
        stock = produit.select_one(".bp_stock")

        if not all([bloc, titre, prix_bloc, ancien]):
            continue

        identifiant = bloc.get("idproduit")

        if not identifiant:
            continue

        try:
            prix_initial = convertir_prix(texte(ancien))

            copie = BeautifulSoup(
                str(prix_bloc),
                "html.parser"
            )

            ancien_copie = copie.select_one(".barrer_prix")

            if ancien_copie:
                ancien_copie.decompose()

            prix_actuel = convertir_prix(texte(copie))

        except (ValueError, TypeError):
            continue

        if prix_actuel <= 0 or prix_initial <= prix_actuel:
            continue

        nom = texte(titre)
        lien = urljoin(BASE, titre.get("href", ""))

        if not nom or not lien:
            continue

        image_url = (
            urljoin(BASE, image.get("src", ""))
            if image else ""
        )

        reduction = round(
            (1 - prix_actuel / prix_initial) * 100
        )

        offres.append({
            "id": f"antretemps-{identifiant}",
            "nom": nom,
            "boutique": BOUTIQUE,
            "prix": prix_actuel,
            "ancien": prix_initial,
            "reduction": reduction,
            "image": image_url,
            "url": lien,
            "stock": texte(stock),
            "dateCollecte": date_collecte
        })

    return offres


def collecter():
    print("=== COLLECTE L'ANTRE TEMPS ===")

    robots = RobotFileParser()
    robots.set_url(BASE + "/robots.txt")
    robots.read()

    if not robots.can_fetch(AGENT, URL):
        raise RuntimeError(
            "Collecte interdite par robots.txt"
        )

    session = requests.Session()
    session.headers.update({"User-Agent": AGENT})

    date_collecte = datetime.now(timezone.utc).isoformat()

    offres_par_id = {}
    signatures_pages = set()

    page = 1
    total_annonce = None
    pages_prevues = None

    while True:
        url_page = (
            URL if page == 1
            else f"{URL}?numPage={page}"
        )

        if not robots.can_fetch(AGENT, url_page):
            raise RuntimeError(
                f"Collecte interdite pour la page {page}"
            )

        response = session.get(url_page, timeout=25)
        response.raise_for_status()

        soup = BeautifulSoup(
            response.text,
            "html.parser"
        )

        produits_html = soup.select(".product_box")

        if page == 1:
            compteur = soup.select_one(
                ".total-products-count"
            )

            if compteur:
                valeur = re.search(
                    r"\d+",
                    texte(compteur).replace(" ", "")
                )

                if valeur:
                    total_annonce = int(valeur.group())

            if not produits_html:
                raise RuntimeError(
                    "Aucun produit sur la premiere page"
                )

            if total_annonce:
                pages_prevues = math.ceil(
                    total_annonce / len(produits_html)
                )

            print(
                f"Produits annonces : {total_annonce}"
            )
            print(
                f"Pages estimees : {pages_prevues}"
            )

        if not produits_html:
            if (
                total_annonce is not None
                and len(offres_par_id) < total_annonce
            ):
                raise RuntimeError(
                    f"Page {page} vide avant la fin "
                    "de la pagination. "
                    "Fichier existant conserve."
                )
            break

        ids_page = tuple(
            bloc.get("idproduit")
            for bloc in soup.select(
                ".product_box .bp_content[idproduit]"
            )
        )

        if ids_page in signatures_pages:
            raise RuntimeError(
                f"Page {page} repetee. "
                "Pagination interrompue."
            )

        signatures_pages.add(ids_page)

        offres_page = extraire_produits(
            soup,
            date_collecte
        )

        for offre in offres_page:
            offres_par_id[offre["id"]] = offre

        print(
            f"Page {page} : "
            f"{len(produits_html)} produits, "
            f"{len(offres_page)} promotions valides, "
            f"{len(offres_par_id)} offres uniques"
        )

        # Le nombre de fiches peut etre superieur
        # au nombre de promotions valides.
        if (
            pages_prevues is not None
            and page >= pages_prevues
        ):
            break

        if page >= 100:
            raise RuntimeError(
                "Limite de securite de 100 pages atteinte"
            )

        page += 1
        time.sleep(1.5)

    offres = list(offres_par_id.values())

    if not offres:
        raise RuntimeError(
            "Aucune promotion valide. "
            "Anciennes donnees conservees."
        )

    # Verifier qu'on a parcouru suffisamment
    # de fiches, meme si certaines n'ont pas
    # de prix promotionnel exploitable.
    if (
        total_annonce is not None
        and sum(len(s) for s in signatures_pages)
        < total_annonce
    ):
        raise RuntimeError(
            "Pagination incomplete. "
            "Anciennes donnees conservees."
        )

    anciennes_offres = []

    if SORTIE.exists():
        anciennes_offres = json.loads(
            SORTIE.read_text(encoding="utf-8")
        )

        if not isinstance(anciennes_offres, list):
            raise RuntimeError("JSON invalide")

    anciennes_boutique = [
        offre for offre in anciennes_offres
        if offre.get("boutique") == BOUTIQUE
    ]

    if (
        anciennes_boutique
        and len(offres) < len(anciennes_boutique) * 0.5
    ):
        raise RuntimeError(
            "Baisse anormale des offres. "
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
    print("=== RESULTAT ===")
    print(f"Promotions L'Antre Temps : {len(offres)}")
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
