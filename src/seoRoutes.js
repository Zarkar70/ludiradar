// Doit rester identique dans scripts/generate-seo.mjs
export const slug = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 85);
export const cheminJeu = (jeu) => `/jeu/${slug(jeu.nom)}-${slug(jeu.boutique)}-${slug(jeu.id || jeu.url || "offre")}/`;
