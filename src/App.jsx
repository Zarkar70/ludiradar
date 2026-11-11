
import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [promotions, setPromotions] = useState([]);
  const [recherche, setRecherche] = useState("");
  const [boutique, setBoutique] = useState("Toutes");
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

  const resultats = promotions.filter((jeu) => {
    return (
      jeu.nom.toLowerCase().includes(recherche.toLowerCase()) &&
      (boutique === "Toutes" || jeu.boutique === boutique)
    );
  });

  return (
    <div className="application">
      <header className="header">
        <h1>🎲 LudiRadar</h1>
        <p>
          Toutes les meilleures promotions de jeux de société
          au même endroit.
        </p>
      </header>

      <main className="contenu">
        <h2>🔥 Les meilleures offres</h2>
        <p>Compare les promotions des boutiques spécialisées.</p>

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
                {nom}
              </option>
            ))}
          </select>
        </div>

        {chargement && <p>Chargement des promotions...</p>}
        {erreur && <p>Erreur : {erreur}</p>}

        {!chargement && !erreur && (
          <>
            <p>{resultats.length} offres trouvées</p>

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

                  <p className="boutique">{jeu.boutique}</p>

                  <p className="ancien">
                    {jeu.ancien.toFixed(2)} €
                  </p>

                  <p className="prix">
                    {jeu.prix.toFixed(2)} €
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
        <p>© 2026 LudiRadar — Comparateur de promotions</p>
        <p>
          Prix relevés lors de la dernière collecte.
          Vérifiez les tarifs sur le site marchand.
        </p>
      </footer>
    </div>
  );
}

export default App;
