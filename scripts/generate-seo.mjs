import fs from "node:fs";
import path from "node:path";
const dist = path.resolve("dist");
const root = "https://ludiradar.pages.dev";
const slug = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 85);
const cheminJeu = (jeu) => `/jeu/${slug(jeu.nom)}-${slug(jeu.boutique)}-${slug(jeu.id || jeu.url || "offre")}/`;
const escapeHtml = (value) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const xmlEscape = escapeHtml;
const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const jsonPath = path.join(dist, "promotions.json");
if (!fs.existsSync(jsonPath)) throw new Error("dist/promotions.json absent : vérifier la copie des données pendant le build.");
const promotions = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
if (!Array.isArray(promotions)) throw new Error("promotions.json doit contenir un tableau.");
const pages = [
  { url: "/", title: "LudiRadar – Promotions de jeux de société", description: "Comparez les prix des jeux de société et découvrez les promotions du moment.", body: "Promotions et comparateur de jeux de société" },
  { url: "/promotions/", title: "Promotions de jeux de société | LudiRadar", description: "Retrouvez les promotions actuelles de jeux de société proposées par plusieurs boutiques.", body: "Promotions de jeux de société" },
  { url: "/comparateur/", title: "Comparateur de prix de jeux de société | LudiRadar", description: "Comparez les prix d'un même jeu dans plusieurs boutiques spécialisées.", body: "Comparateur de prix de jeux de société" },
];
const seen = new Set();
for (const jeu of promotions) {
  if (!jeu.nom || !jeu.boutique || !jeu.url || !Number.isFinite(Number(jeu.prix)) || Number(jeu.prix) <= 0) continue;
  const url = cheminJeu(jeu);
  if (seen.has(url)) continue;
  seen.add(url);
  const nom = escapeHtml(jeu.nom);
  const boutique = escapeHtml(jeu.boutique);
  pages.push({ url, title: `${jeu.nom} en promotion | LudiRadar`, description: `${jeu.nom} : prix actuel chez ${jeu.boutique} et lien vers l'offre.`, body: `<h1>${nom}</h1><p>Prix chez ${boutique} : ${escapeHtml(jeu.prix)} €</p><p><a href="${escapeHtml(jeu.url)}">Voir l'offre chez ${boutique}</a></p>` });
}
for (const page of pages) {
  const canonical = root + page.url;
  const head = `<title>${escapeHtml(page.title)}</title><meta name="description" content="${escapeHtml(page.description)}"><link rel="canonical" href="${escapeHtml(canonical)}">`;
  let html = template.replace(/<title>[\s\S]*?<\/title>/i, "").replace("</head>", `${head}</head>`);
  // Texte visible même si JavaScript est indisponible ; React conserve le rendu interactif.
  html = html.replace('<div id="root"></div>', `<div id="root"><main>${page.body}</main></div>`);
  const folder = path.join(dist, page.url.slice(1));
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "index.html"), html);
}
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p => `  <url><loc>${xmlEscape(root + p.url)}</loc></url>`).join("\n")}\n</urlset>\n`;
fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap);
fs.writeFileSync(path.join(dist, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${root}/sitemap.xml\n`);
console.log(`SEO : ${pages.length} pages HTML et sitemap.xml générés.`);
