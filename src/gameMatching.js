
export function normaliserNom(nom) {
  return String(nom || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Similarite entre deux textes, de 0 a 1.
function similariteTexte(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const motsA = new Set(a.split(" "));
  const motsB = new Set(b.split(" "));

  const communs = [...motsA].filter(
    (mot) => motsB.has(mot)
  ).length;

  const union = new Set([...motsA, ...motsB]).size;

  return union ? communs / union : 0;
}

function memeEdition(a, b) {
  const editions = [
    "junior",
    "kids",
    "extension",
    "expansion",
    "deluxe",
    "collector",
    "voyage",
    "pocket",
    "mini",
    "duel"
  ];

  const motsA = new Set(a.split(" "));
  const motsB = new Set(b.split(" "));

  return editions.every(
    (mot) => motsA.has(mot) === motsB.has(mot)
  );
}

export function comparerNoms(nomA, nomB) {
  const a = normaliserNom(nomA);
  const b = normaliserNom(nomB);

  if (!a || !b) {
    return { type: "different", score: 0 };
  }

  if (a === b) {
    return { type: "identique", score: 1 };
  }

  if (!memeEdition(a, b)) {
    return { type: "different", score: 0 };
  }

  const score = similariteTexte(a, b);

  if (score >= 0.85) {
    return { type: "probable", score };
  }

  return { type: "different", score };
}

export function trouverCorrespondances(promotions) {
  const correspondances = [];

  for (let i = 0; i < promotions.length; i++) {
    for (let j = i + 1; j < promotions.length; j++) {
      const a = promotions[i];
      const b = promotions[j];

      if (a.boutique === b.boutique) {
        continue;
      }

      const resultat = comparerNoms(a.nom, b.nom);

      if (resultat.type !== "different") {
        correspondances.push({
          jeuA: a,
          jeuB: b,
          ...resultat
        });
      }
    }
  }

  return correspondances.sort(
    (a, b) => b.score - a.score
  );
}
