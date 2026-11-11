
import { useEffect, useMemo, useState } from "react";
import { trouverCorrespondances, normaliserNom } from "./gameMatching";
import "./App.css";

function formatPrix(prix) {
  return Number(prix).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR"
  });
}

function App() {
  const [promotions, setPromotions] = useState([]);
  const [recherche, setRecherche] = useState("");
  const [boutique, setBoutique] = useState("Toutes");
  const [tri, setTri] = useState("reduction");
  const [mode, setMode] = useState("promotions");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  // Charger les promotions
  useEffect(() => {
    fetch("/promotions.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Impossible de charger les promotions");
        }

        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) {
          throw new Error("Format des promotions incorrect");
        }

        setPromotions(data);
      })
      .catch((err) => {
        setErreur(err.message);
      })
      .finally(() => {
        setChargement(false);
      });
  }, []);

  // Liste des boutiques
  const boutiques = useMemo(() => {
    return [
      "Toutes",
      ...new Set(promotions.map((jeu) => jeu.boutique))
    ];
  }, [promotions]);

  // Filtrer et trier les promotions
  const resultats = useMemo(() => {
    return promotions
      .filter((jeu) => {
        const correspondRecherche = normaliserNom(
          jeu.nom
        ).includes(normaliserNom(recherche));

        const correspondBoutique =
          boutique === "Toutes" ||
          jeu.boutique === boutique;

        return correspondRecherche && correspondBoutique;
      })
      .sort((a, b) => {
        if (tri === "prix-croissant") {
          return Number(a.prix) - Number(b.prix);
        }

        if (tri === "prix-decroissant") {
          return Number(b.prix) - Number(a.prix);
        }

        return Number(b.reduction) - Number(a.reduction);
      });
  }, [promotions, recherche, boutique, tri]);

  // Comparateur de prix amélioré
  const comparaisons = useMemo(() => {
    const correspondances = trouverCorrespondances(promotions);

    return correspondances
      .filter((comparaison) => {
        const rechercheNormalisee = normaliserNom(recherche);

        return (
          normaliserNom(comparaison.jeuA.nom).includes(
            rechercheNormalisee
          ) ||
          normaliserNom(comparaison.jeuB.nom).includes(
            rechercheNormalisee
          )
        );
      })
      .map((comparaison) => {
        const offres = [
          comparaison.jeuA,
          comparaison.jeuB
        ].sort(
          (a, b) => Number(a.prix) - Number(b.prix)
        );

        return {
          ...comparaison,
          offres
        };
      });
  }, [promotions, recherche]);

  // Statistiques
  const nombreBoutiques = new Set(
    promotions.map((jeu) => jeu.boutique)
  ).size;

  const correspondancesExactes = comparaisons.filter(
    (comparaison) => comparaison.type === "identique"
  ).length;

  const correspondancesProbables = comparaisons.filter(
    (comparaison) => comparaison.type === "probable"
  ).length;

  return (
    <div className="application">
      {/* EN-TETE */}
      <header className="header">
        <h1>🎲 LudiRadar</h1>

        <p>
          Les meilleures promotions de jeux de société
          réunies au même endroit.
        </p>
      </header>

      <main className="contenu">
        {/* PRESENTATION */}
        <h2>🔥 Les meilleures offres</h2>

        <p>
          Compare les prix des boutiques spécialisées
          et trouve tes prochains jeux au meilleur prix.
        </p>

        {/* STATISTIQUES */}
        <div className="statistiques">
          <p>
            🎲 <strong>{promotions.length}</strong> promotions
          </p>

          <p>
            🏪 <strong>{nombreBoutiques}</strong> boutiques
          </p>
        </div>

        {/* NAVIGATION */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            margin: "24px 0"
          }}
        >
          <button
            type="button"
            className="bouton-offre"
            onClick={() => setMode("promotions")}
            aria-pressed={mode === "promotions"}
            style={{
              opacity: mode === "promotions" ? 1 : 0.65,
              cursor: "pointer"
            }}
          >
            🔥 Toutes les promotions
          </button>

          <button
            type="button"
            className="bouton-offre"
            onClick={() => setMode("comparateur")}
            aria-pressed={mode === "comparateur"}
            style={{
              opacity: mode === "comparateur" ? 1 : 0.65,
              cursor: "pointer"
            }}
          >
            ⚖️ Comparateur de prix
          </button>
        </div>

        {/* FILTRES */}
        <div className="filtres">
          <input
            type="search"
            placeholder="🔍 Rechercher un jeu..."
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />

          {mode === "promotions" && (
            <>
              <select
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
              </select>
            </>
          )}
        </div>

        {/* CHARGEMENT ET ERREURS */}
        {chargement && (
          <p>Chargement des promotions...</p>
        )}

        {erreur && (
          <p>Erreur : {erreur}</p>
        )}

        {/* LISTE DES PROMOTIONS */}
        {!chargement &&
          !erreur &&
          mode === "promotions" && (
            <>
              <p>
                <strong>{resultats.length}</strong>{" "}
                offres trouvées
              </p>

              {resultats.length === 0 && (
                <p>Aucune promotion trouvée.</p>
              )}

              <div className="grille">
                {resultats.map((jeu) => (
                  <div
                    className="carte"
                    key={jeu.id}
                  >
                    <span className="reduction">
                      -{jeu.reduction}%
                    </span>

                    <div className="illustration">
                      {jeu.image ? (
                        <img
                          src={jeu.image}
                          alt={jeu.nom}
                          loading="lazy"
                          style={{
                            width: "100%",
                            height: "170px",
                            objectFit: "contain"
                          }}
                        />
                      ) : (
                        "🎲"
                      )}
                    </div>

                    <h3>{jeu.nom}</h3>

                    <p className="boutique">
                      🏪 {jeu.boutique}
                    </p>

                    <p className="ancien">
                      {formatPrix(jeu.ancien)}
                    </p>

                    <p className="prix">
                      {formatPrix(jeu.prix)}
                    </p>

                    <a
                      href={jeu.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bouton-offre"
                    >
                      Voir la promotion
                    </a>
                  </div>
                ))}
              </div>
            </>
          )}

        {/* COMPARATEUR DE PRIX */}
        {!chargement &&
          !erreur &&
          mode === "comparateur" && (
            <section>
              <h2>⚖️ Comparateur de prix</h2>

              <p>
                Compare les offres de Ludifolie et
                Philibert pour un même jeu.
              </p>

              {/* STATISTIQUES COMPARATEUR */}
              <div
                style={{
                  display: "flex",
                  gap: "20px",
                  flexWrap: "wrap",
                  margin: "20px 0"
                }}
              >
                <p>
                  🔎 <strong>
                    {comparaisons.length}
                  </strong>{" "}
                  correspondances détectées
                </p>

                <p>
                  ✅ <strong>
                    {correspondancesExactes}
                  </strong>{" "}
                  titres identiques
                </p>

                <p>
                  ⚠️ <strong>
                    {correspondancesProbables}
                  </strong>{" "}
                  correspondances probables
                </p>
              </div>

              {comparaisons.length === 0 && (
                <div
                  style={{
                    background: "#ffffff",
                    padding: "30px",
                    borderRadius: "12px",
                    marginTop: "20px"
                  }}
                >
                  <h3>
                    🎲 Aucun jeu commun détecté
                  </h3>

                  <p>
                    Pour le moment, aucun jeu en promotion
                    n'a été reconnu dans plusieurs boutiques.
                  </p>

                  <p>
                    Le comparateur recherchera automatiquement
                    de nouvelles correspondances lors des
                    prochaines actualisations des promotions.
                  </p>
                </div>
              )}

              {/* CARTES DE COMPARAISON */}
              <div className="grille">
                {comparaisons.map((comparaison) => {
                  const offres = comparaison.offres;

                  const meilleur = offres[0];
                  const plusCher = offres[offres.length - 1];

                  const economie =
                    Number(plusCher.prix) -
                    Number(meilleur.prix);

                  const estIdentique =
                    comparaison.type === "identique";

                  return (
                    <div
                      className="carte"
                      key={
                        `${comparaison.jeuA.id}-` +
                        `${comparaison.jeuB.id}`
                      }
                    >
                      {/* IMAGE */}
                      <div className="illustration">
                        {meilleur.image ? (
                          <img
                            src={meilleur.image}
                            alt={meilleur.nom}
                            loading="lazy"
                            style={{
                              width: "100%",
                              height: "170px",
                              objectFit: "contain"
                            }}
                          />
                        ) : (
                          "🎲"
                        )}
                      </div>

                      {/* NOM */}
                      <h3>{meilleur.nom}</h3>

                      {/* NIVEAU DE CORRESPONDANCE */}
                      <p
                        style={{
                          color: estIdentique
                            ? "#15803d"
                            : "#a16207",
                          fontWeight: "bold"
                        }}
                      >
                        {estIdentique
                          ? "✓ Même titre détecté"
                          : "⚠ Correspondance probable — à vérifier"}
                      </p>

                      <p>
                        🏪 {offres.length} boutiques
                      </p>

                      <p className="prix">
                        Dès {formatPrix(meilleur.prix)}
                      </p>

                      {/* PRIX PAR BOUTIQUE */}
                      {offres.map((offre, index) => (
                        <div
                          key={offre.id}
                          style={{
                            borderTop: "1px solid #ddd",
                            padding: "12px 0"
                          }}
                        >
                          <strong>
                            {offre.boutique}
                          </strong>

                          {index === 0 && (
                            <span
                              style={{
                                marginLeft: "8px",
                                color: "#15803d",
                                fontWeight: "bold"
                              }}
                            >
                              ✓ Prix le plus bas
                            </span>
                          )}

                          <p
                            style={{
                              fontSize: "20px",
                              fontWeight: "bold",
                              margin: "10px 0"
                            }}
                          >
                            {formatPrix(offre.prix)}
                          </p>

                          <a
                            href={offre.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bouton-offre"
                          >
                            Voir chez {offre.boutique}
                          </a>
                        </div>
                      ))}

                      {/* ECONOMIE */}
                      {economie > 0 && (
                        <div
                          style={{
                            background: "#ecfdf5",
                            borderRadius: "10px",
                            padding: "14px",
                            marginTop: "16px"
                          }}
                        >
                          <p
                            style={{
                              color: "#15803d",
                              fontWeight: "bold",
                              margin: 0
                            }}
                          >
                            💰 Écart de prix :{" "}
                            {formatPrix(economie)}
                          </p>

                          {!estIdentique && (
                            <p
                              style={{
                                fontSize: "12px",
                                color: "#92400e",
                                marginBottom: 0
                              }}
                            >
                              Vérifiez qu'il s'agit
                              bien de la même édition
                              avant de comparer les prix.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
      </main>

      {/* PIED DE PAGE */}
      <footer>
        <p>
          © 2026 LudiRadar — Comparateur de promotions
        </p>

        <p>
          Prix relevés lors de la dernière collecte.
          Vérifiez les tarifs sur le site marchand.
        </p>

        <p>
          Les correspondances entre jeux sont établies
          automatiquement à partir de leurs noms.
          Vérifiez les éditions et les versions linguistiques.
        </p>
      </footer>
    </div>
  );
}

export default App;
