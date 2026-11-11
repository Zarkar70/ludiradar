
import { useEffect, useMemo, useState } from "react";
import { comparerNoms } from "./gameMatching.js";
import "./App.css";

const URL_PROMOTIONS = "/promotions.json";

const formaterPrix = (valeur) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(valeur) || 0);

function App() {
  const [promotions, setPromotions] = useState([]);
  const [recherche, setRecherche] = useState("");
  const [boutique, setBoutique] = useState("Toutes");
  const [tri, setTri] = useState("reduction");
  const [mode, setMode] = useState("promotions");
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
        };
      })
      .sort(
        (a, b) =>
          b.prixMaximum -
          b.prixMinimum -
          (a.prixMaximum - a.prixMinimum)
      );
  }, [promotions]);

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

      <main className="contenu">
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

        <div className="onglets">
          <button
            type="button"
            className={
              mode === "promotions"
                ? "onglet actif"
                : "onglet"
            }
            onClick={() => setMode("promotions")}
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
            onClick={() => setMode("comparateur")}
          >
            ⚖️ Comparateur de prix
          </button>
        </div>

        <div className="filtres">
          <input
            type="search"
            aria-label="Rechercher un jeu"
            placeholder="🔍 Rechercher un jeu..."
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />

          {mode === "promotions" && (
            <>
              <select
                aria-label="Filtrer par boutique"
                value={boutique}
                onChange={(e) => setBoutique(e.target.value)}
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
                onChange={(e) => setTri(e.target.value)}
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
        </div>

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
            {mode === "promotions" ? (
              <section className="section-offres">
                <div className="resultats-entete">
                  <h2>🎮 Les bons plans du moment</h2>
                  <span>
                    {resultats.length} offre
                    {resultats.length > 1 ? "s" : ""} trouvée
                    {resultats.length > 1 ? "s" : ""}
                  </span>
                </div>

                {resultats.length === 0 ? (
                  <div className="message-etat">
                    🔍 Aucun jeu ne correspond à ta recherche.
                  </div>
                ) : (
                  <div className="grille">
                    {resultats.map((jeu) => (
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

                          <h3>{jeu.nom}</h3>

                          <div className="bloc-prix">
                            <span className="ancien">
                              {formaterPrix(jeu.ancien)}
                            </span>

                            <strong className="prix">
                              {formaterPrix(jeu.prix)}
                            </strong>
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
                            <span>Écart de prix</span>
                            <strong>
                              {formaterPrix(
                                groupe.prixMaximum -
                                  groupe.prixMinimum
                              )}
                            </strong>
                          </div>
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
