
import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [promotions, setPromotions] = useState([]);
  const [recherche, setRecherche] = useState("");
  const [boutique, setBoutique] = useState("Toutes");
  const [tri, setTri] = useState("reduction");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

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
        setChargement(false);
      })
      .catch((err) => {
        setErreur(err.message);
        setChargement(false);
      });
  }, []);

  const boutiques = [
    "Toutes",
    ...new Set(promotions.map((jeu) => jeu.boutique))
  ];

  const resultats = promotions
    .filter((jeu) => {
      const correspondRecherche = jeu.nom
        .toLowerCase()
        .includes(recherche.toLowerCase());

      const correspondBoutique =
        boutique === "Toutes" || jeu.boutique === boutique;

      return correspondRecherche && correspondBoutique;
    })
    .sort((a, b) => {
      if (tri === "prix-croissant") {
        return a.prix - b.prix;
      }

      if (tri === "prix-decroissant") {
        return b.prix - a.prix;
      }

      return b.reduction - a.reduction;
    });

  const nombreBoutiques = new Set(
    promotions.map((jeu) => jeu.boutique)
  ).size;

  return (
    <div className="application">
      <header className="header">
        <h1>🎲 LudiRadar</h1>
        <p>
          Les meilleures promotions de jeux de société
          réunies au même endroit.
        </p>
      </header>

      <main className="contenu">
        <h2>🔥 Les meilleures offres</h2>

        <p>
          Compare les prix des boutiques spécialisées
          et trouve tes prochains jeux au meilleur prix.
        </p>

        <div className="statistiques">
          <p>
            🎲 <strong>{promotions.length}</strong> promotions
          </p>

          <p>
            🏪 <strong>{nombreBoutiques}</strong> boutiques
          </p>
        </div>

        <div className="filtres">
          <input
            type="search"
            placeholder="🔍 Rechercher un jeu..."
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />

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
        </div>

        {chargement && (
          <p>Chargement des promotions...</p>
        )}

        {erreur && (
          <p>Erreur : {erreur}</p>
        )}

        {!chargement && !erreur && (
          <>
            <p>
              <strong>{resultats.length}</strong> offres trouvées
            </p>

            {resultats.length === 0 && (
              <p>
                Aucune promotion ne correspond à ta recherche.
              </p>
            )}

            <div className="grille">
              {resultats.map((jeu) => (
                <div className="carte" key={jeu.id}>
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
                    {Number(jeu.ancien).toFixed(2)} €
                  </p>

                  <p className="prix">
                    {Number(jeu.prix).toFixed(2)} €
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
      </main>

      <footer>
        <p>
          © 2026 LudiRadar — Comparateur de promotions
        </p>
        <p>
          Prix relevés lors de la dernière collecte.
          Vérifiez les tarifs sur le site marchand.
        </p>
      </footer>
    </div>
  );
}

export default App;
