
import { useEffect, useMemo, useState } from "react";
import { comparerNoms } from "./gameMatching.js";
import "./App.css";
import { cheminJeu } from "./seoRoutes.js";

const URL_PROMOTIONS = "/promotions.json";
const URL_DETAILS = "/jeux-details.json";

// Même normalisation que scripts/enrichir_jeux.py pour les noms français usuels.
const cleJeu = (nom) => String(nom || "")
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const valeurPresente = (valeur) => valeur !== null && valeur !== undefined && valeur !== "";
const listeTexte = (valeur) => Array.isArray(valeur) ? valeur.filter((x) => typeof x === "string" && x.trim()) : [];

function CaracteristiquesJeu({ details }) {
  if (!details) return <p className="fiche-attente">Caractéristiques du jeu en cours de préparation.</p>;
  const infos = [
    { icone: "👥", titre: "Joueurs", valeur: valeurPresente(details.joueursMin) && valeurPresente(details.joueursMax)
      ? (details.joueursMin === details.joueursMax ? `${details.joueursMin}` : `${details.joueursMin} à ${details.joueursMax}`) : null },
    { icone: "⏱️", titre: "Durée", valeur: valeurPresente(details.dureeMinutes) ? `${details.dureeMinutes} min` : null },
    { icone: "🎂", titre: "Âge", valeur: valeurPresente(details.ageMinimum) ? `Dès ${details.ageMinimum} ans` : null },
    { icone: "🏢", titre: "Éditeur", valeur: details.editeur || null },
  ].filter((info) => valeurPresente(info.valeur));
  const categories = listeTexte(details.categories);
  const auteurs = listeTexte(details.auteurs);
  const description = typeof details.description === "string" ? details.description.trim() : "";
  if (!infos.length && !categories.length && !auteurs.length && !description) {
    return <p className="fiche-attente">Caractéristiques du jeu en cours de préparation.</p>;
  }
  return <>
    {infos.length > 0 && <div className="fiche-caracteristiques">{infos.map((info) =>
      <div className="fiche-caracteristique" key={info.titre}>
        <span aria-hidden="true">{info.icone}</span><div><small>{info.titre}</small><strong>{info.valeur}</strong></div>
      </div>
    )}</div>}
    {categories.length > 0 && <p className="fiche-detail-ligne"><strong>Catégories :</strong> {categories.join(", ")}</p>}
    {auteurs.length > 0 && <p className="fiche-detail-ligne"><strong>Auteur(s) :</strong> {auteurs.join(", ")}</p>}
    {description && <div className="fiche-description"><h3>Description du jeu</h3><p>{description}</p></div>}
    {details.source && <p className="fiche-source">Source des caractéristiques : {details.source}</p>}
  </>;
}

const JEUX_PAR_PAGE = 24;
const JEUX_ACCUEIL = 12;

const formaterPrix = (valeur) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(valeur) || 0);

// Les anciens prix sont des prix barres declares par les marchands,
// et non une moyenne historique du marche.
const prixValide = (valeur) => {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const nombre = Number(valeur);
  return Number.isFinite(nombre) && nombre > 0 ? nombre : null;
};

const calculerReference = (offres) => {
  const anciensPrix = offres.map((offre) => prixValide(offre.ancien)).filter((prix) => prix !== null);
  if (!anciensPrix.length) return null;
  return anciensPrix.reduce((total, prix) => total + prix, 0) / anciensPrix.length;
};

const calculerEconomie = (reference, prix) => {
  const prixActuel = prixValide(prix);
  if (reference === null || prixActuel === null) return null;
  const montant = Math.max(0, reference - prixActuel);
  return { montant, pourcentage: Math.round((montant / reference) * 100) };
};

function App() {
  const [chemin, setChemin] = useState(window.location.pathname + window.location.search);
  const naviguer = (nouveauChemin) => {
    window.history.pushState({}, "", nouveauChemin);
    setChemin(nouveauChemin);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const ecouter = () => setChemin(window.location.pathname + window.location.search);
    window.addEventListener("popstate", ecouter);
    return () => window.removeEventListener("popstate", ecouter);
  }, []);
  const [promotions, setPromotions] = useState([]);
  const [detailsJeux, setDetailsJeux] = useState({});
  const [recherche, setRecherche] = useState("");
  const [rechercheAccueil, setRechercheAccueil] = useState("");
  const [boutique, setBoutique] = useState("Toutes");
  const [tri, setTri] = useState("reduction");
  const accueil = chemin.split("?")[0] === "/" || chemin.split("?")[0] === "";
  const lancerRechercheAccueil = (e) => {
    e.preventDefault();
    const terme = rechercheAccueil.trim();
    if (!terme) return;
    setRecherche(terme);
    setBoutique("Toutes");
    setTri("reduction");
    naviguer("/promotions/");
  };
  const mode = chemin.startsWith("/comparateur") ? "comparateur" : "promotions";
  const pageDemandee = Number(new URLSearchParams(chemin.split("?")[1] || "").get("page") || 1);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function chargerPromotions() {
      try {
        const reponse = await fetch(URL_PROMOTIONS, {
          signal: controller.signal,
          cache: "no-cache",
        });

        if (!reponse.ok) {
          throw new Error("Impossible de charger les promotions.");
        }

        const donnees = await reponse.json();

        if (!Array.isArray(donnees)) {
          throw new Error("Le format des promotions est incorrect.");
        }

        setPromotions(donnees);
        setErreur("");
      } catch (err) {
        if (err.name !== "AbortError") {
          setErreur(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setChargement(false);
        }
      }
    }

    chargerPromotions();

    return () => controller.abort();
  }, []);

  // Les fiches restent consultables si le fichier de détails n'est pas encore publié.
  useEffect(() => {
    const controller = new AbortController();
    fetch(URL_DETAILS, { signal: controller.signal, cache: "no-cache" })
      .then((reponse) => {
        if (!reponse.ok) throw new Error("Détails indisponibles");
        return reponse.json();
      })
      .then((donnees) => {
        if (donnees && typeof donnees === "object" && !Array.isArray(donnees)) setDetailsJeux(donnees);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Choix stable et diversifie de boites issues des promotions actuelles.
  const imagesBandeau = useMemo(() => {
    const nomsVus = new Set();
    const candidats = promotions.filter((jeu) => {
      if (typeof jeu.image !== "string" || !/^https?:\/\//i.test(jeu.image)) return false;
      const nom = String(jeu.nom || "").trim().toLocaleLowerCase("fr");
      if (!nom || nomsVus.has(nom)) return false;
      nomsVus.add(nom);
      return true;
    });

    // Repartition reproductible : pas de changement aleatoire a chaque rendu.
    const empreinte = (texte) => {
      let valeur = 2166136261;
      for (const caractere of texte) {
        valeur = Math.imul(valeur ^ caractere.charCodeAt(0), 16777619);
      }
      return valeur >>> 0;
    };

    return candidats
      .map((jeu) => ({ ...jeu, ordre: empreinte(String(jeu.id || jeu.nom)) }))
      .sort((a, b) => a.ordre - b.ordre)
      .slice(0, 30);
  }, [promotions]);

  const pageJeu = chemin.startsWith("/jeu/");
  const jeuSelectionne = pageJeu
    ? promotions.find((jeu) => cheminJeu(jeu) === chemin || cheminJeu(jeu).slice(0, -1) === chemin)
    : null;
  const detailsSelectionnes = jeuSelectionne ? detailsJeux[cleJeu(jeuSelectionne.nom)] : null;
  // Comparer ici uniquement les intitulés strictement identiques : les rapprochements
  // approximatifs du comparateur peuvent mélanger éditions et extensions.
  const offresMemeJeu = jeuSelectionne ? promotions
    .filter((offre) => cleJeu(offre.nom) === cleJeu(jeuSelectionne.nom) && prixValide(offre.prix) !== null)
    .sort((a, b) => Number(a.prix) - Number(b.prix)) : [];

  useEffect(() => {
    const titre = jeuSelectionne
      ? `${jeuSelectionne.nom} en promotion | LudiRadar`
      : chemin.startsWith("/comparateur")
        ? "Comparateur de prix de jeux de société | LudiRadar"
        : chemin.startsWith("/promotions")
          ? "Promotions de jeux de société | LudiRadar"
          : "LudiRadar – Promotions et comparateur de jeux de société";
    document.title = titre;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = jeuSelectionne
      ? `Découvrez ${jeuSelectionne.nom} chez ${jeuSelectionne.boutique}, prix et réduction affichés sur LudiRadar.`
      : "Comparez les promotions et les prix des jeux de société dans plusieurs boutiques spécialisées avec LudiRadar.";
    let canonique = document.querySelector('link[rel="canonical"]');
    if (!canonique) {
      canonique = document.createElement("link");
      canonique.rel = "canonical";
      document.head.appendChild(canonique);
    }
    canonique.href = `https://ludiradar.pages.dev${chemin.split("?")[0] || "/"}`;
  }, [chemin, jeuSelectionne]);

  const boutiques = useMemo(() => {
    const noms = promotions
      .map((jeu) => jeu.boutique)
      .filter(Boolean);

    return ["Toutes", ...new Set(noms)].sort((a, b) => {
      if (a === "Toutes") return -1;
      if (b === "Toutes") return 1;
      return a.localeCompare(b, "fr");
    });
  }, [promotions]);

  const resultats = useMemo(() => {
    const terme = recherche.trim().toLocaleLowerCase("fr");

    const offres = promotions.filter((jeu) => {
      const nom = String(jeu.nom || "").toLocaleLowerCase("fr");

      const correspondRecherche = nom.includes(terme);
      const correspondBoutique =
        boutique === "Toutes" || jeu.boutique === boutique;

      return correspondRecherche && correspondBoutique;
    });

    return offres.sort((a, b) => {
      if (tri === "prix-croissant") {
        return Number(a.prix) - Number(b.prix);
      }

      if (tri === "prix-decroissant") {
        return Number(b.prix) - Number(a.prix);
      }

      if (tri === "nom") {
        return String(a.nom).localeCompare(String(b.nom), "fr");
      }

      return Number(b.reduction) - Number(a.reduction);
    });
  }, [promotions, recherche, boutique, tri]);

  const promotionsAccueil = useMemo(() => {
    const nomsVus = new Set();
    return [...promotions]
      .filter((jeu) => jeu.nom && prixValide(jeu.prix) !== null)
      .sort((a, b) => Number(b.reduction || 0) - Number(a.reduction || 0))
      .filter((jeu) => {
        const nom = String(jeu.nom).trim().toLocaleLowerCase("fr");
        if (nomsVus.has(nom)) return false;
        nomsVus.add(nom);
        return true;
      })
      .slice(0, JEUX_ACCUEIL);
  }, [promotions]);

  const nombrePages = Math.max(1, Math.ceil(resultats.length / JEUX_PAR_PAGE));
  const pageActuelle = Number.isInteger(pageDemandee) && pageDemandee > 0
    ? Math.min(pageDemandee, nombrePages)
    : 1;
  const offresAffichees = accueil
    ? promotionsAccueil
    : resultats.slice((pageActuelle - 1) * JEUX_PAR_PAGE, pageActuelle * JEUX_PAR_PAGE);
  const allerPage = (page) => {
    if (page < 1 || page > nombrePages) return;
    naviguer(page === 1 ? "/promotions/" : `/promotions/?page=${page}`);
  };
  const reinitialiserPage = () => {
    if (!accueil && mode === "promotions" && chemin.includes("?page=")) {
      window.history.replaceState({}, "", "/promotions/");
      setChemin("/promotions/");
    }
  };

  const comparaisons = useMemo(() => {
    const groupes = [];
    const jeux = promotions.filter(
      (jeu) =>
        jeu.nom &&
        jeu.boutique &&
        Number.isFinite(Number(jeu.prix))
    );

    for (const jeu of jeux) {
      let meilleurGroupe = null;
      let meilleurScore = 0;
      let meilleurType = "different";

      for (const groupe of groupes) {
        if (
          groupe.offres.some(
            (offre) => offre.boutique === jeu.boutique
          )
        ) {
          continue;
        }

        const correspondances = groupe.offres.map((offre) =>
          comparerNoms(offre.nom, jeu.nom)
        );

        const correspondance = correspondances.reduce(
          (meilleure, actuelle) =>
            Number(actuelle.score) > Number(meilleure.score)
              ? actuelle
              : meilleure,
          { type: "different", score: 0 }
        );

        const type = correspondance.type;
        const score = Number(correspondance.score) || 0;

        if (
          (type === "identique" || type === "probable") &&
          score > meilleurScore
        ) {
          meilleurGroupe = groupe;
          meilleurScore = score;
          meilleurType = type;
        }
      }

      if (meilleurGroupe) {
        meilleurGroupe.offres.push(jeu);
        meilleurGroupe.score = Math.min(
          meilleurGroupe.score,
          meilleurScore
        );

        if (meilleurType === "probable") {
          meilleurGroupe.type = "probable";
        }
      } else {
        groupes.push({
          nom: jeu.nom,
          offres: [jeu],
          score: 1,
          type: "identique",
        });
      }
    }

    return groupes
      .filter(
        (groupe) =>
          new Set(groupe.offres.map((jeu) => jeu.boutique))
            .size >= 2
      )
      .map((groupe) => {
        const offres = [...groupe.offres].sort(
          (a, b) => Number(a.prix) - Number(b.prix)
        );

        return {
          ...groupe,
          offres,
          prixMinimum: Number(offres[0].prix),
          prixMaximum: Number(offres[offres.length - 1].prix),
          prixMoyenHorsPromotion: calculerReference(offres),
        };
      })
      .sort(
        (a, b) =>
          b.prixMaximum -
          b.prixMinimum -
          (a.prixMaximum - a.prixMinimum)
      );
  }, [promotions]);

  // Associer les offres du catalogue aux groupes deja reconnus par le comparateur.
  const referencesParOffre = useMemo(() => {
    const references = new Map();
    for (const groupe of comparaisons) {
      if (groupe.prixMoyenHorsPromotion === null) continue;
      for (const offre of groupe.offres) {
        references.set(`${offre.boutique}-${offre.id}`, groupe.prixMoyenHorsPromotion);
      }
    }
    return references;
  }, [comparaisons]);

  const comparaisonsFiltrees = useMemo(() => {
    const terme = recherche.trim().toLocaleLowerCase("fr");

    return comparaisons.filter((groupe) =>
      groupe.offres.some((jeu) =>
        String(jeu.nom || "")
          .toLocaleLowerCase("fr")
          .includes(terme)
      )
    );
  }, [comparaisons, recherche]);

  const nombreIdentiques = comparaisons.filter(
    (groupe) => groupe.type === "identique"
  ).length;

  const nombreProbables = comparaisons.filter(
    (groupe) => groupe.type === "probable"
  ).length;

  const derniereCollecte = promotions
    .map((jeu) => new Date(jeu.dateCollecte).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  return (
    <div className="application">
      <header className="header">
        {imagesBandeau.length > 0 && (
          <div className="header-pelemele" aria-hidden="true">
            {imagesBandeau.map((jeu, index) => (
              <div className="header-boite" key={`${jeu.id || jeu.nom}-${index}`}>
                <img src={jeu.image} alt="" loading={index < 12 ? "eager" : "lazy"} decoding="async" />
              </div>
            ))}
          </div>
        )}
        <div className="header-contenu">
          <div className="marque">
            <span className="logo-de">🎲</span>

            <h1>
              Ludi<span>Radar</span>
            </h1>

            <span className="badge-beta">BÊTA</span>
          </div>

          <p className="sous-titre">
            Les meilleures promotions de jeux de société,
            réunies au même endroit.
          </p>

          <div className="header-tags">
            <span>🔥 Bons plans</span>
            <span>🎯 Recherche rapide</span>
            <span>⚖️ Comparaison des prix</span>
          </div>
        </div>
      </header>

      <div className="bandeau-beta">
        <span className="beta-icone">🚧</span>

        <div>
          <strong>
            LudiRadar est en cours de développement
          </strong>
          <p>
            De nouvelles boutiques et fonctionnalités arrivent
            progressivement. Certaines offres peuvent évoluer
            entre deux actualisations. Merci de votre visite !
          </p>
        </div>

        <span className="beta-version">VERSION BÊTA</span>
      </div>

      <nav className="seo-navigation" aria-label="Navigation principale">
        <a href="/" onClick={(e) => { e.preventDefault(); naviguer("/"); }}>Accueil</a>
        <a href="/promotions/" onClick={(e) => { e.preventDefault(); naviguer("/promotions/"); }}>Promotions</a>
        <a href="/comparateur/" onClick={(e) => { e.preventDefault(); naviguer("/comparateur/"); }}>Comparateur</a>
      </nav>
      {pageJeu ? (
        <main className="contenu">
          {chargement ? <p>Chargement du jeu…</p> : jeuSelectionne ? (
            <article className="fiche-jeu">
              <a href="/promotions/" onClick={(e) => { e.preventDefault(); naviguer("/promotions/"); }}>← Retour aux promotions</a>
              <h2>{jeuSelectionne.nom}</h2>
              {jeuSelectionne.image && <img src={jeuSelectionne.image} alt={`Boîte du jeu ${jeuSelectionne.nom}`} />}
              <p>Offre proposée par {jeuSelectionne.boutique}</p>
              <p><strong>{formaterPrix(jeuSelectionne.prix)}</strong> {prixValide(jeuSelectionne.ancien) && <span className="ancien">{formaterPrix(jeuSelectionne.ancien)}</span>}</p>
              <p>Réduction annoncée : {jeuSelectionne.reduction}%</p>
              <a className="bouton-offre" href={jeuSelectionne.url} target="_blank" rel="noopener noreferrer">Voir l'offre chez le marchand ↗</a>
              <section className="fiche-informations" aria-label="Informations sur le jeu">
                <h3>🎲 À propos du jeu</h3>
                <CaracteristiquesJeu details={detailsSelectionnes} />
              </section>
              {offresMemeJeu.length > 1 && <section className="fiche-comparaison">
                <h3>⚖️ Comparer les offres</h3>
                <p>Offres portant le même nom. Vérifiez l'édition et les frais de livraison.</p>
                <div className="fiche-comparaison-liste">{offresMemeJeu.map((offre, index) =>
                  <div className="fiche-comparaison-ligne" key={`${offre.boutique}-${offre.id}`}>
                    <span>{offre.boutique}{index === 0 && <small className="fiche-meilleur">Meilleur prix affiché</small>}</span>
                    <strong>{formaterPrix(offre.prix)}</strong>
                    <a href={offre.url} target="_blank" rel="noopener noreferrer">Voir l'offre ↗</a>
                  </div>
                )}</div>
              </section>}
              <p>Les prix et disponibilités sont indicatifs. Vérifiez-les sur le site marchand.</p>
            </article>
          ) : <div className="message-etat"><h2>Offre indisponible</h2><p>Cette promotion n'est plus présente dans notre catalogue.</p><a href="/promotions/">Voir les promotions actuelles</a></div>}
        </main>
      ) : <main className="contenu">
        <section className="introduction">
          <div className="titre-section">
            <span className="icone-section">🔥</span>
            <div>
              <h2>Les meilleures offres</h2>
              <p>
                Compare les prix des boutiques spécialisées et
                trouve tes prochains jeux au meilleur prix.
              </p>
            </div>
          </div>

          <div className="statistiques">
            <div className="statistique">
              <span className="stat-icone">🎲</span>
              <div>
                <strong>{promotions.length}</strong>
                <span>promotions</span>
              </div>
            </div>

            <div className="statistique">
              <span className="stat-icone">🏬</span>
              <div>
                <strong>{Math.max(0, boutiques.length - 1)}</strong>
                <span>boutiques</span>
              </div>
            </div>

            <div className="statistique">
              <span className="stat-icone">⚖️</span>
              <div>
                <strong>{comparaisons.length}</strong>
                <span>comparaisons</span>
              </div>
            </div>
          </div>
        </section>

        {accueil && (
          <form className="recherche-accueil" onSubmit={lancerRechercheAccueil}>
            <h2>🔍 Quel jeu recherches-tu ?</h2>
            <p>Retrouve rapidement les promotions de tes jeux préférés.</p>
            <div className="recherche-accueil-champs">
              <input
                type="search"
                placeholder="Ex. : Skyjo, Catan, Azul..."
                aria-label="Rechercher un jeu de société"
                value={rechercheAccueil}
                onChange={(e) => setRechercheAccueil(e.target.value)}
              />
              <button type="submit">Rechercher</button>
            </div>
          </form>
        )}

        {accueil && (
          <div className="accueil-intro">
            <div>
              <span className="accueil-eyebrow">🎲 Sélection LudiRadar</span>
              <h2>Les bons plans à découvrir</h2>
              <p>Une sélection de 12 jeux en promotion, sans parcourir tout le catalogue.</p>
            </div>
            <a href="/promotions/" className="accueil-cta" onClick={(e) => { e.preventDefault(); naviguer("/promotions/"); }}>
              Explorer toutes les promotions ↗
            </a>
          </div>
        )}
        {!accueil && <div className="onglets">
          <button
            type="button"
            className={
              mode === "promotions"
                ? "onglet actif"
                : "onglet"
            }
            onClick={() => { naviguer("/promotions/"); }}
          >
            🔥 Toutes les promotions
          </button>

          <button
            type="button"
            className={
              mode === "comparateur"
                ? "onglet actif"
                : "onglet"
            }
            onClick={() => { naviguer("/comparateur/"); }}
          >
            ⚖️ Comparateur de prix
          </button>
        </div>}

        {!accueil && <div className="filtres">
          <input
            type="search"
            aria-label="Rechercher un jeu"
            placeholder="🔍 Rechercher un jeu..."
            value={recherche}
            onChange={(e) => { setRecherche(e.target.value); reinitialiserPage(); }}
          />

          {mode === "promotions" && (
            <>
              <select
                aria-label="Filtrer par boutique"
                value={boutique}
                onChange={(e) => { setBoutique(e.target.value); reinitialiserPage(); }}
              >
                {boutiques.map((nom) => (
                  <option key={nom} value={nom}>
                    {nom === "Toutes"
                      ? "Toutes les boutiques"
                      : nom}
                  </option>
                ))}
              </select>

              <select
                aria-label="Trier les promotions"
                value={tri}
                onChange={(e) => { setTri(e.target.value); reinitialiserPage(); }}
              >
                <option value="reduction">
                  Plus fortes réductions
                </option>
                <option value="prix-croissant">
                  Prix croissant
                </option>
                <option value="prix-decroissant">
                  Prix décroissant
                </option>
                <option value="nom">
                  Ordre alphabétique
                </option>
              </select>
            </>
          )}
        </div>}

        {chargement && (
          <div className="message-etat">
            🎲 Chargement des promotions...
          </div>
        )}

        {erreur && (
          <div className="message-etat message-erreur">
            ⚠️ {erreur}
          </div>
        )}

        {!chargement && !erreur && (
          <>
            {accueil || mode === "promotions" ? (
              <section className="section-offres">
                <div className="resultats-entete">
                  <h2>{accueil ? "🔥 Notre sélection du moment" : "🎮 Toutes les promotions"}</h2>
                  <span>
                    {accueil ? offresAffichees.length : resultats.length} offre{(accueil ? offresAffichees.length : resultats.length) > 1 ? "s" : ""}
                  </span>
                </div>

                {offresAffichees.length === 0 ? (
                  <div className="message-etat">
                    🔍 Aucun jeu ne correspond à ta recherche.
                  </div>
                ) : (
                  <div className="grille">
                    {offresAffichees.map((jeu) => (
                      <article
                        className="carte"
                        key={`${jeu.boutique}-${jeu.id}`}
                      >
                        <div className="carte-image">
                          <span className="reduction">
                            -{jeu.reduction}%
                          </span>

                          {jeu.image ? (
                            <img
                              src={jeu.image}
                              alt={jeu.nom}
                              loading="lazy"
                            />
                          ) : (
                            <span className="image-absente">
                              🎲
                            </span>
                          )}
                        </div>

                        <div className="carte-contenu">
                          <span className="boutique">
                            🏬 {jeu.boutique}
                          </span>

                          <h3><a className="lien-fiche" href={cheminJeu(jeu)} onClick={(e) => { e.preventDefault(); naviguer(cheminJeu(jeu)); }}>{jeu.nom}</a></h3>

                          <div className="bloc-prix">
                            <span className="ancien">
                              {formaterPrix(jeu.ancien)}
                            </span>

                            <strong className="prix">
                              {formaterPrix(jeu.prix)}
                            </strong>
                          {(() => {
                              const cle = `${jeu.boutique}-${jeu.id}`;
                              const moyenne = referencesParOffre.get(cle);
                              const reference = moyenne ?? prixValide(jeu.ancien);
                              const economie = calculerEconomie(reference, jeu.prix);
                              if (reference === null || economie === null) return null;
                              return (
                                <div className="reference-prix">
                                  <span>{moyenne !== undefined ? "Prix moyen hors promotion (boutiques comparées)" : "Prix barré de cette boutique"} : <strong>{formaterPrix(reference)}</strong></span>
                                  <span className="gain-prix">Économie estimée : {formaterPrix(economie.montant)} ({economie.pourcentage} %)</span>
                                </div>
                              );
                            })()}
                          </div>

                          <a
                            href={jeu.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bouton-offre"
                          >
                            Voir l'offre
                            <span aria-hidden="true">↗</span>
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {accueil && !chargement && (
                  <div className="accueil-bas">
                    <p>Envie de découvrir davantage de jeux ? Consulte l'ensemble des offres et filtre par boutique ou par prix.</p>
                    <a href="/promotions/" className="accueil-cta" onClick={(e) => { e.preventDefault(); naviguer("/promotions/"); }}>Voir toutes les {promotions.length} promotions ↗</a>
                    <a href="/comparateur/" className="accueil-lien" onClick={(e) => { e.preventDefault(); naviguer("/comparateur/"); }}>Comparer les prix entre boutiques</a>
                  </div>
                )}
                {!accueil && resultats.length > JEUX_PAR_PAGE && (
                  <nav className="pagination" aria-label="Pagination des promotions">
                    <p>Page {pageActuelle} sur {nombrePages} — {resultats.length} offres</p>
                    <div className="pagination-boutons">
                      <button type="button" disabled={pageActuelle === 1} onClick={() => allerPage(pageActuelle - 1)}>← Précédent</button>
                      {Array.from({ length: nombrePages }, (_, i) => i + 1)
                        .filter((n) => n === 1 || n === nombrePages || Math.abs(n - pageActuelle) <= 2)
                        .map((n, i, pages) => (
                          <span className="pagination-element" key={n}>
                            {i > 0 && n - pages[i - 1] > 1 && <span aria-hidden="true">…</span>}
                            <a href={n === 1 ? "/promotions/" : `/promotions/?page=${n}`}
                              aria-current={n === pageActuelle ? "page" : undefined}
                              onClick={(e) => { e.preventDefault(); allerPage(n); }}>{n}</a>
                          </span>
                        ))}
                      <button type="button" disabled={pageActuelle === nombrePages} onClick={() => allerPage(pageActuelle + 1)}>Suivant →</button>
                    </div>
                  </nav>
                )}
              </section>
            ) : (
              <section className="section-comparateur">
                <div className="resultats-entete">
                  <div>
                    <h2>⚖️ Comparateur de prix</h2>
                    <p>
                      Compare les offres d'un même jeu dans
                      plusieurs boutiques.
                    </p>
                  </div>
                </div>

                <div className="stats-comparateur">
                  <span>
                    🔎 {comparaisonsFiltrees.length} correspondance
                    {comparaisonsFiltrees.length > 1 ? "s" : ""}
                  </span>
                  <span>
                    ✅ {nombreIdentiques} titre
                    {nombreIdentiques > 1 ? "s" : ""} identique
                    {nombreIdentiques > 1 ? "s" : ""}
                  </span>
                  <span>
                    ⚠️ {nombreProbables} correspondance
                    {nombreProbables > 1 ? "s" : ""} probable
                    {nombreProbables > 1 ? "s" : ""}
                  </span>
                </div>

                {comparaisonsFiltrees.length === 0 ? (
                  <div className="message-etat">
                    <h3>🎲 Aucun jeu commun détecté</h3>
                    <p>
                      Pour le moment, aucun jeu en promotion
                      n'a été reconnu dans plusieurs boutiques.
                    </p>
                    <p>
                      Le comparateur recherchera de nouvelles
                      correspondances lors des prochaines
                      actualisations.
                    </p>
                  </div>
                ) : (
                  <div className="liste-comparaisons">
                    {comparaisonsFiltrees.map((groupe, index) => (
                      <article
                        className="comparaison"
                        key={`${groupe.nom}-${index}`}
                      >
                        <div className="comparaison-entete">
                          <div className="comparaison-identite">
                            <div className="miniature-jeu miniature-entete">
                              {groupe.offres.some((offre) => offre.image) ? (
                                <img
                                  src={groupe.offres.find((offre) => offre.image).image}
                                  alt={`Boîte de ${groupe.nom}`}
                                  loading="lazy"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                    e.currentTarget.parentElement.classList.add("sans-image");
                                  }}
                                />
                              ) : (
                                <span aria-hidden="true">🎲</span>
                              )}
                            </div>
                            <div className="comparaison-titre">
                              <span
                              className={
                                groupe.type === "identique"
                                  ? "badge-correspondance identique"
                                  : "badge-correspondance probable"
                              }
                            >
                              {groupe.type === "identique"
                                ? "✓ Titres identiques"
                                : "⚠ Correspondance probable"}
                            </span>

                              <h3>{groupe.nom}</h3>
                            </div>
                          </div>

                          <div className="economie">
                            <span>Écart entre les boutiques</span>
                            <strong>
                              {formaterPrix(
                                groupe.prixMaximum -
                                  groupe.prixMinimum
                              )}
                            </strong>
                          </div>
                        </div>

                        
                        <div className="resume-reference">
                          {groupe.prixMoyenHorsPromotion !== null && calculerEconomie(groupe.prixMoyenHorsPromotion, groupe.prixMinimum) !== null ? (
                            <>
                              <div><span>Prix moyen hors promotion (prix barrés)</span><strong>{formaterPrix(groupe.prixMoyenHorsPromotion)}</strong></div>
                              <div><span>Meilleur prix actuel</span><strong>{formaterPrix(groupe.prixMinimum)}</strong></div>
                              <div className="resume-gain"><span>Économie estimée par rapport à la moyenne</span><strong>{formaterPrix(calculerEconomie(groupe.prixMoyenHorsPromotion, groupe.prixMinimum).montant)} ({calculerEconomie(groupe.prixMoyenHorsPromotion, groupe.prixMinimum).pourcentage} %)</strong></div>
                            </>
                          ) : (
                            <p>Prix moyen hors promotion indisponible.</p>
                          )}
                        </div>

                        {groupe.type === "probable" && (
                          <p className="avertissement">
                            Vérifie qu'il s'agit bien de la
                            même édition avant d'acheter.
                          </p>
                        )}

                        <div className="comparaison-offres">
                          {groupe.offres.map((jeu, i) => (
                            <div
                              className={
                                i === 0
                                  ? "ligne-offre meilleur-prix"
                                  : "ligne-offre"
                              }
                              key={`${jeu.boutique}-${jeu.id}`}
                            >
                              <div className="ligne-description">
                                <strong>{jeu.boutique}</strong>
                                <span>{jeu.nom}</span>
                              </div>

                              <div className="ligne-tarif">
                                {i === 0 && (
                                  <span className="etiquette-meilleur">
                                    Meilleur prix
                                  </span>
                                )}
                                <strong>
                                  {formaterPrix(jeu.prix)}
                                </strong>
                              </div>

                              <a
                                href={jeu.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="lien-comparaison"
                              >
                                Voir l'offre ↗
                              </a>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
      }
      <footer className="footer">
        <div className="footer-contenu">
          <div className="footer-marque">
            <strong>🎲 LudiRadar</strong>
            <span className="footer-beta">BÊTA</span>
          </div>

          <p>
            © {new Date().getFullYear()} LudiRadar —
            Comparateur de promotions de jeux de société.
          </p>

          <p>
            Site en cours de développement. Les prix et
            disponibilités sont donnés à titre indicatif.
            Vérifiez toujours les informations sur le site
            marchand.
          </p>

          {derniereCollecte && (
            <p className="date-collecte">
              Dernier relevé :
              {" "}
              {new Date(derniereCollecte).toLocaleString(
                "fr-FR",
                {
                  dateStyle: "long",
                  timeStyle: "short",
                }
              )}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;
