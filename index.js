// =============================
// BOT CTM – INDEX.JS COMPLET
// =============================

const RESOURCE_KEYS = Object.keys(COLS); // ["bois","pierre",...,"argent"]
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const express = require("express");
const CITY_NAME_COL = "S";
require("dotenv").config();

// =============================
// EXPRESS (Render keep alive)
// =============================

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("🤖 Bot CTM actif"));
app.listen(PORT, () => console.log(`🌐 Web OK : ${PORT}`));

// =============================
// GOOGLE SHEETS CONFIG
// =============================

const authPath = path.join(process.cwd(), "gestion-ctm-bc86da201e15.json");
if (!fs.existsSync(authPath)) {
  console.error("❌ Fichier Google Auth introuvable");
  process.exit(1);
}
const authData = require(authPath);

const SHEET_ID = "1c6tGfwmwEXDmyHoiUwsI7prtlfu_gN0nq-F82jC0As4";
const SHEET_NAME = "Rapport";
const PLAYER_NAME_COL = "O";

// =============================
// UTILITAIRES
// =============================

function idx(letter) {
  let i = 0;
  for (const c of letter) i = i * 26 + (c.charCodeAt(0) - 64);
  return i - 1;
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: authData,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return google.sheets({ version: "v4", auth });
}

// =============================
// STOCKAGE (COL L) – PARSE + CAP
// =============================

const STORAGE_CAP_COL = "L";
// Ressources exclues du cap (argent illimité)
const NO_CAP_RESOURCES = new Set(["argent"]);

/**
 * Parse les formats :
 * - "100k" => 100000
 * - "1.2m" => 1200000
 * - "2M" => 2000000
 * - "100 000" / "100,000" => 100000
 * - "100000" => 100000
 */
function parseCompactNumber(input) {
  if (input === null || input === undefined) return 0;

  let s = String(input).trim().toLowerCase();
  if (!s) return 0;

  // retire espaces et séparateurs courants
  s = s.replace(/\s/g, "").replace(/,/g, "");

  // format suffixe k/m/b
  const m = s.match(/^(-?\d+(?:\.\d+)?)([kmb])?$/i);
  if (!m) {
    // fallback: ne garder que chiffres (et signe - si présent)
    const digits = parseInt(s.replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(digits) ? digits : 0;
  }

  const num = parseFloat(m[1]);
  if (!Number.isFinite(num)) return 0;

  const suffix = m[2];
  const mult =
    suffix === "k" ? 1_000 :
    suffix === "m" ? 1_000_000 :
    suffix === "b" ? 1_000_000_000 :
    1;

  return Math.trunc(num * mult);
}

function getStorageCapFromRow(row) {
  const raw = row[idx(STORAGE_CAP_COL)];
  const cap = parseCompactNumber(raw);
  // cap invalide ou 0 => pas de limite
  return cap > 0 ? cap : Infinity;
}

// =============================
// COLONNES RESSOURCES
// =============================

const COLS = {
  bois: "K",
  pierre: "I",
  nourriture: "J",
  fer: "D",
  sel: "E",
  argile: "F",
  laine: "G",
  fourrure: "H",
  poterie: "C",
  argent: "N"
};

// =============================
// DETECTION NIVEAU DE VILLE
// =============================

function getCityLevel(row) {
  if (row[idx("BR")]) return "cite";
  if (row[idx("BA")]) return "ville";
  if (row[idx("AN")]) return "bourg";
  if (row[idx("AC")]) return "village";
  return null;
}

function hasCity(row, required) {
  if (!required) return true;
  const order = ["village", "bourg", "ville", "cite"];
  return order.indexOf(getCityLevel(row)) >= order.indexOf(required);
}

// =============================
// BATIMENTS / COLONNES
// =============================

const BUILDING_COLS = {
  scierie: { 1: "X", 2: "AF", 3: "AP", 4: "BC", 5: "BT" },
  ferme: { 1: "Y", 2: "AG", 3: "AQ", 4: "BD", 5: "BU" },
  carriere_pierre: { 1: "AH", 2: "AR", 3: "BE", 4: "BV" },
  atelier_tanneur: { 1: "AI", 2: "AS", 3: "BF", 4: "BW" },
  paturage: { 1: "AT", 2: "BG", 3: "BX" },
  carriere_argile: { 1: "AU", 2: "BH", 3: "BY" },
  mine_fer: { 1: "BJ", 2: "CA" },
  mine_sel: { 1: "BI", 2: "BZ" },
  atelier_poterie: { 1: "BK", 2: "CB" },

  entrepot: { 1: "W", 2: "AD", 3: "AO", 4: "BB", 5: "BS" },

  camp_militaire: { 1: "Z", 2: "AA", 3: "AB" },
  caserne_militaire: { 1: "AJ", 2: "AK", 3: "AL" },
  quartier_militaire: { 1: "AV", 2: "AW", 3: "AX" },
  bastion_militaire: { 1: "BL", 2: "BM", 3: "BN" },
  forteresse_militaire: { 1: "CC", 2: "CD", 3: "CE" },

  village: { 1: "AC" },
  bourg: { 1: "AN" },
  ville: { 1: "BA" },
  cite: { 1: "BR" }
};
// =============================
// COUTS DES BATIMENTS
// =============================

const BUILD_COSTS = {

  // ===== PRODUCTION =====
  scierie: {
    1: { costs: { argent: 500 }, requires: "village" },
    2: { costs: { argent: 1000, bois: 500, nourriture: 500, pierre: 500 }, requires: "village" },
    3: { costs: { argent: 1500, bois: 1000, nourriture: 1000, pierre: 1000, argile: 500 }, requires: "village" },
    4: { costs: { argent: 2000, bois: 1500, nourriture: 1500, pierre: 1500, argile: 1000, fer: 500 }, requires: "ville" },
    5: { costs: { argent: 2500, bois: 2000, nourriture: 2000, pierre: 2000, argile: 1500, fer: 1000 }, requires: "ville" }
  },

  ferme: {
    1: { costs: { argent: 500, bois: 400 }, requires: "village" },
    2: { costs: { argent: 1200, bois: 800, nourriture: 700, pierre: 600 }, requires: "village" },
    3: { costs: { argent: 1800, bois: 1400, nourriture: 1300, pierre: 1200, laine: 500 }, requires: "village" },
    4: { costs: { argent: 2400, bois: 2000, nourriture: 1900, pierre: 1800, laine: 1100, sel: 400, poterie: 400 }, requires: "ville" },
    5: { costs: { argent: 3000, bois: 2600, nourriture: 2500, pierre: 2400, laine: 1700, sel: 1000, poterie: 1000 }, requires: "ville" }
  },
  carriere_pierre: {
    1: { costs: { argent: 1500, bois: 1000, nourriture: 1000 }, requires: "village" },
    2: { costs: { argent: 2000, bois: 1500, nourriture: 1500, pierre: 1000, argile: 500 }, requires: "village" },
    3: { costs: { argent: 2500, bois: 2000, nourriture: 2000, pierre: 1500, argile: 1000, fer: 500 }, requires: "ville" },
    4: { costs: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, argile: 1500, fer: 1000 }, requires: "ville" }
  },

  atelier_tanneur: {
    1: { costs: { argent: 1500, bois: 1000, nourriture: 1000, pierre: 600 }, requires: "village" },
    2: { costs: { argent: 2000, bois: 1500, nourriture: 1500, pierre: 1500, laine: 500 }, requires: "village" },
    3: { costs: { argent: 2500, bois: 2000, nourriture: 2000, pierre: 1500, laine: 1000, fer: 500, sel: 500 }, requires: "ville" },
    4: { costs: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, argile: 1500, fer: 1000, sel: 1000 }, requires: "ville" }
  },

  paturage: {
    1: { costs: { argent: 2000, bois: 1500, nourriture: 1500, pierre: 1000, fourrure: 1000 }, requires: "village" },
    2: { costs: { argent: 2500, bois: 2000, nourriture: 2000, pierre: 1500, fourrure: 1500, fer: 500, sel: 500, laine: 500 }, requires: "ville" },
    3: { costs: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, fourrure: 1500, fer: 1000, sel: 1000, laine: 1000 }, requires: "ville" }
  },

  carriere_argile: {
    1: { costs: { argent: 2000, bois: 1500, nourriture: 1500, pierre: 1000, fourrure: 500 }, requires: "village" },
    2: { costs: { argent: 2500, nourriture: 2000, pierre: 1500, fourrure: 1500, argile: 1000, fer: 500 }, requires: "ville" },
    3: { costs: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, fourrure: 1500, argile: 1500, fer: 1000 }, requires: "ville" }
  },
  mine_fer: {
    1: { costs: { argent: 2500, nourriture: 2000, pierre: 1500, fourrure: 1500, argile: 1000 }, requires: "ville" },
    2: { costs: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, fourrure: 1500, argile: 1500, fer: 1000 }, requires: "cite" }
  },

  mine_sel: {
    1: { costs: { argent: 2500, nourriture: 2000, pierre: 1500, fourrure: 1500, argile: 1000, fer: 500 }, requires: "ville" },
    2: { costs: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, fourrure: 1500, argile: 1500, fer: 1000 }, requires: "cite" }
  },

  atelier_poterie: {
    1: { costs: { argent: 2500, nourriture: 2000, pierre: 1500, fourrure: 1500, argile: 2000, laine: 500 }, requires: "ville" },
    2: { costs: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, fourrure: 1500, argile: 1500, fer: 1000, laine: 1000 }, requires: "cite" }
  },



  // ===== ENTREPOT =====
  entrepot: {
    1: { costs: { argent: 2000, bois: 1000, pierre: 1000, argile: 1000 } },
    2: { costs: { argent: 4000, bois: 3000, pierre: 3000, argile: 3000 } },
    3: { costs: { argent: 6000, bois: 5000, pierre: 5000, argile: 5000 } },
    4: { costs: { argent: 8000, bois: 7000, pierre: 7000, argile: 7000 } },
    5: { costs: { argent: 10000, bois: 9000, pierre: 9000, argile: 9000 } }
  },

  // ===== VILLES =====
  village: { 1: { costs: { argent: 4500, bois: 3000, nourriture: 3000 } } },
  bourg: { 1: { costs: { argent: 6000, bois: 5000, nourriture: 5000, pierre: 2500, fourrure: 2500 } } },
  ville: { 1: { costs: { argent: 9500, bois: 7000, nourriture: 7000, pierre: 5000, fourrure: 5000, argile: 2500, laine: 2500 } } },
  cite: { 1: { costs: { argent: 12500, bois: 10000, nourriture: 10000, pierre: 6000, fourrure: 6000, argile: 6000, laine: 4500, poterie: 3500, fer: 3500, sel: 3500 } } },

  // ===== MILITAIRE =====
  camp_militaire: {
    1: { costs: { argent: 1000, bois: 500, nourriture: 500 } },
    2: { costs: { argent: 500, bois: 500, pierre: 500, nourriture: 1000 } },
    3: { costs: { argent: 1000, bois: 1000, pierre: 1000, nourriture: 1500, argile: 1500, laine: 1500 } }
  },

  caserne_militaire: {
    1: { costs: { argent: 2000, bois: 1000, nourriture: 1000, pierre: 1000, fourrure: 1000 } },
    2: { costs: { argent: 1500, bois: 1500, pierre: 1500, nourriture: 2000 } },
    3: { costs: { argent: 2000, bois: 2000, pierre: 2000, nourriture: 2500, argile: 2000, laine: 2000 } }
  },
  quartier_militaire: {
  1: { costs: { argent: 3500, bois: 2000, nourriture: 2000, pierre: 2000, fourrure: 2000, laine: 1000, argile: 1000 } },
  2: { costs: { argent: 2500, bois: 2500, pierre: 2500, nourriture: 3000 } },
  3: { costs: { argent: 3000, bois: 3000, pierre: 3000, nourriture: 3500, argile: 2500, laine: 2500 } }
  },

  bastion_militaire: {
    1: { costs: { argent: 5000, bois: 3500, nourriture: 3500, pierre: 3600, fourrure: 3600, laine: 2500, argile: 2500, fer: 1500, sel: 1500, poterie: 1500 } },
    2: { costs: { argent: 3500, bois: 3500, pierre: 3500, nourriture: 4000 } },
    3: { costs: { argent: 4000, bois: 4000, pierre: 4000, nourriture: 4500, argile: 3000, laine: 3000 } }
  },

  forteresse_militaire: {
    1: { costs: { argent: 9000, bois: 4500, nourriture: 4500, pierre: 4000, fourrure: 4000, laine: 3000, argile: 3000, fer: 2500, sel: 2500, poterie: 2500 } },
    2: { costs: { argent: 4500, bois: 4500, pierre: 4500, nourriture: 5000 } },
    3: { costs: { argent: 5000, bois: 5000, pierre: 5000, nourriture: 5500, argile: 3500, laine: 3500 } }
}

};
// =============================
// OUTILS BUILD
// =============================

function canAfford(row, costs) {
  return Object.entries(costs).every(([r, v]) => {
    const cur = parseInt((row[idx(COLS[r])] || "0").replace(/\D/g, "")) || 0;
    return cur >= v;
  });
}

function deduct(row, costs) {
  for (const [r, v] of Object.entries(costs)) {
    const i = idx(COLS[r]);
    row[i] = String((parseInt(row[i] || "0") || 0) - v);
  }
}

function nextLevel(row, key) {
  for (const lvl of Object.keys(BUILDING_COLS[key])) {
    const cell = row[idx(BUILDING_COLS[key][lvl])] || "";

    if (cell.toString().trim() === "") {
      return parseInt(lvl);
    }
  }

  return null;
}

// =============================
// OUTILS VILLES
// =============================

function getPlayerCities(rows, player) {
  const cities = [];

  let lastPlayer = null;

  const cleanPlayer = player.trim();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    let sheetPlayer = (row[idx(PLAYER_NAME_COL)] || "").toString().trim();

    // Si cellule vide → fusion → on reprend la précédente
    if (sheetPlayer === "" && lastPlayer) {
      sheetPlayer = lastPlayer;
    }

    if (sheetPlayer !== "") {
      lastPlayer = sheetPlayer;
    }

    const cityName = (row[idx("S")] || "").toString().trim();

    if (sheetPlayer === cleanPlayer && cityName !== "") {
      cities.push({
        index: i,
        data: row,
        cityName
      });
    }
  }

  return cities;
}
// =============================
// ROLL – CONFIG + UTILITAIRES + HANDLER
// (repris de l'ancien code, adapté à idx())
// =============================

const LEVEL_CONFIG = {
  1: { dice: 5, mult: 100 },
  2: { dice: 6, mult: 150 },
  3: { dice: 7, mult: 200 },
  4: { dice: 8, mult: 250 },
  5: { dice: 9, mult: 300 }
};

const BUILD_RESOURCE = {
  scierie: "bois",
  ferme: "nourriture",
  carriere_pierre: "pierre",
  atelier_tanneur: "fourrure",
  paturage: "laine",
  carriere_argile: "argile",
  mine_sel: "sel",
  mine_fer: "fer",
  atelier_poterie: "poterie"
};

const RESOURCE_EMOJIS = {
  bois: "🪵",
  pierre: "🪨",
  nourriture: "🍖",
  fer: "⛓️",
  sel: "🧂",
  argile: "🏺",
  laine: "🐑",
  fourrure: "🦊",
  poterie: "⚱️",
  argent: "💰"
};

function rollDice(dice, mult) {
  return (Math.floor(Math.random() * dice) + 1) * mult;
}

function gainForBuilding(lvl) {
  const cfg = LEVEL_CONFIG[lvl] || LEVEL_CONFIG[1];
  return rollDice(cfg.dice, cfg.mult);
}

async function readSheet(sheets) {
  const range = `${SHEET_NAME}!A11:CH`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range
  });
  return res.data.values || [];
}

/**
 * ⚠️ Important: le roll doit fonctionner sur "toutes les lignes du joueur"
 * (y compris les lignes vides / 2e ligne de ville).
 * On reprend la logique de ton ancien getPlayerCities() :
 * - on trouve la première ligne du joueur
 * - puis on prend TOUTES les lignes suivantes jusqu'au prochain joueur (col O non vide et différent)
 */
function getPlayerRowsForRoll(rows, playerName) {
  const out = [];
  let found = false;

  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i][idx(PLAYER_NAME_COL)];

    if (cell && cell.trim() === playerName.trim()) {
      found = true;
      out.push({ index: i, data: rows[i] });
      continue;
    }

    if (found) {
      // stop dès qu'on rencontre un autre joueur (cellule col O non vide)
      const nextPlayer = cell && cell.trim() !== "";
      if (nextPlayer) break;

      out.push({ index: i, data: rows[i] });
    }
  }

  return out;
}

function detectBuildingLevels(row) {
  const levels = {};

  for (const [bat, lvlCols] of Object.entries(BUILDING_COLS)) {
    // On ignore les "bâtiments visuels" qui n'ont pas de ressource associée
    if (!BUILD_RESOURCE[bat]) continue;

    let max = 0;
    for (const [lvl, col] of Object.entries(lvlCols)) {
      const val = row[idx(col)];
      if (val && typeof val === "string" && val.toLowerCase().includes("terminé")) {
        max = Math.max(max, parseInt(lvl, 10));
      }
    }
    levels[bat] = max;
  }

  return levels;
}

function calcTotalGains(playerRows) {
  const totals = {};

  for (const city of playerRows) {
    const lvls = detectBuildingLevels(city.data);

    for (const [bat, lvl] of Object.entries(lvls)) {
      if (lvl > 0) {
        const ressource = BUILD_RESOURCE[bat];
        const gain = gainForBuilding(lvl);
        totals[ressource] = (totals[ressource] || 0) + gain;
      }
    }
  }

  return totals;
}

async function updatePlayerResources(sheets, baseRowIndex, updates) {
  const rowNumber = 11 + baseRowIndex;

  // A:N inclut L et N (donc cap + ressources + argent)
  const range = `${SHEET_NAME}!A${rowNumber}:N${rowNumber}`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range
  });

  const row = res.data.values?.[0] || [];
  const cap = getStorageCapFromRow(row);

  const applied = {}; // delta réellement appliqué
  const final = {};   // valeur finale

  for (const [key, deltaRaw] of Object.entries(updates)) {
    if (!COLS[key]) continue;

    const colIndex = idx(COLS[key]);
    const cur = parseCompactNumber(row[colIndex] || "0");
    const delta = parseInt(deltaRaw, 10) || 0;

    let next = cur + delta;

    // Jamais négatif
    if (next < 0) next = 0;

    // Cap uniquement si ce n'est PAS une ressource exclue (argent)
    if (!NO_CAP_RESOURCES.has(key) && Number.isFinite(cap)) {
      next = Math.min(next, cap);
    }

    row[colIndex] = String(next);

    applied[key] = next - cur;
    final[key] = next;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    resource: { values: [row] }
  });

  return { applied, final, cap };
}


async function handleRoll(interaction) {
  const playerName = interaction.user.username;
  await interaction.deferReply();

  try {
    const sheets = await getSheetsClient();
    const rows = await readSheet(sheets);

    const playerRows = getPlayerRowsForRoll(rows, playerName);
    if (!playerRows.length) {
      return interaction.editReply(`👋 Aucun enregistrement trouvé pour **${playerName}** dans le Sheets.`);
    }

    const totalGains = calcTotalGains(playerRows);

    // ✅ Les ressources sont stockées sur la première ligne du joueur
    const { applied, cap } = await updatePlayerResources(sheets, playerRows[0].index, totalGains);

    const fields = Object.entries(totalGains).map(([res, wanted]) => {
      const got = applied?.[res] ?? 0; // delta réellement appliqué
      const capped = got < wanted;

      const capText = Number.isFinite(cap) ? ` (cap **${Number(cap).toLocaleString()}**)` : "";

      return {
        name: `${RESOURCE_EMOJIS[res] || ""} ${res.charAt(0).toUpperCase() + res.slice(1)}`,
        value: capped
          ? `**+${Number(got).toLocaleString()}**${capText}`
          : `**+${Number(got).toLocaleString()}**`,
        inline: true
      };
    });

    const embed = new EmbedBuilder()
      .setTitle("🎲 Récolte journalière")
      .setDescription(`**${playerName}** a récolté les ressources de toutes ses lignes/villes :`)
      .addFields(fields)
      .setColor(0x00cc66);

    return interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.error(err);
    return interaction.editReply(`⚠️ Erreur : ${err.message}`);
  }
}

// =============================
// ARGENT – CONFIG + UTILITAIRES + HANDLER
// (NE MODIFIE PAS getCityLevel/hasCity existants)
// =============================

const ARGENT_CONFIG = {
  cite:   { dice: 5, mult: 300 },
  ville:  { dice: 5, mult: 250 },
  bourg:  { dice: 5, mult: 200 },
  village:{ dice: 5, mult: 150 },
  hameau: { dice: 5, mult: 100 }
};

// Pour l'argent : on ne compte QUE le dernier niveau "Terminé".
// Si rien n'est "Terminé" => hameau.
function getCityTierForArgent(row) {
  const isDone = (col) => {
    const v = (row[idx(col)] || "").toString().toLowerCase().trim();
    return v.includes("terminé");
  };

  if (isDone("BR")) return "cite";
  if (isDone("BA")) return "ville";
  if (isDone("AN")) return "bourg";
  if (isDone("AC")) return "village";
  return "hameau";
}

async function handleArgent(interaction) {
  const playerName = interaction.user.username;
  await interaction.deferReply();

  try {
    const sheets = await getSheetsClient();
    const rows = await readSheet(sheets);

    // On récupère les VILLES (lignes avec un nom de ville en col S)
    const cities = getPlayerCities(rows, playerName);
    if (!cities.length) {
      return interaction.editReply(`👋 Aucun enregistrement trouvé pour **${playerName}** dans le Sheets.`);
    }

    let total = 0;
    const perCity = [];

    for (const c of cities) {
      const tier = getCityTierForArgent(c.data);
      const cfg = ARGENT_CONFIG[tier] || ARGENT_CONFIG.hameau;
      const gain = rollDice(cfg.dice, cfg.mult);

      total += gain;
      perCity.push({ cityName: c.cityName, tier, gain });
    }

    // Ajout sur la première ligne du joueur (même logique que /roll)
    const playerRows = getPlayerRowsForRoll(rows, playerName);
    if (!playerRows.length) {
      return interaction.editReply(`👋 Aucun enregistrement trouvé pour **${playerName}** dans le Sheets.`);
    }

    await updatePlayerResources(sheets, playerRows[0].index, { argent: total });

    const fields = perCity.map(x => ({
      name: `🏛️ ${x.cityName}`,
      value: `Niveau: **${x.tier}**\nGain: **+${Number(x.gain).toLocaleString()}** ${RESOURCE_EMOJIS.argent}`,
      inline: true
    }));

    const embed = new EmbedBuilder()
      .setTitle("💰 Revenus journaliers")
      .setDescription(`**${playerName}** a perçu des revenus sur **${cities.length}** ville(s).`)
      .addFields(fields)
      .addFields({
        name: "Total",
        value: `**+${Number(total).toLocaleString()}** ${RESOURCE_EMOJIS.argent}`,
        inline: false
      })
      .setColor(0xFFD700);

    return interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.error(err);
    return interaction.editReply(`⚠️ Erreur : ${err.message}`);
  }
}

async function handleAdd(interaction) {
  // Nouveaux paramètres:
  // - joueur (User) optionnel
  // - ressource (String) optionnel (défaut: "argent")
  // - montant (Integer) requis
  const targetUser = interaction.options.getUser("joueur") || interaction.user;
  const targetName = targetUser.username;

  const ressource = (interaction.options.getString("ressource") || "argent").toLowerCase();
  const montant = interaction.options.getInteger("montant");

  await interaction.deferReply();

  if (!montant || montant <= 0) {
    return interaction.editReply("❌ Montant invalide. Mets un nombre entier positif.");
  }
  if (!COLS[ressource]) {
    return interaction.editReply(`❌ Ressource invalide: **${ressource}**. Ressources possibles: ${RESOURCE_KEYS.join(", ")}`);
  }

  try {
    const sheets = await getSheetsClient();
    const rows = await readSheet(sheets);

    const playerRows = getPlayerRowsForRoll(rows, targetName);
    if (!playerRows.length) {
      return interaction.editReply(`👋 Aucun enregistrement trouvé pour **${targetName}** dans le Sheets.`);
    }

    const { applied, cap } = await updatePlayerResources(sheets, playerRows[0].index, { [ressource]: montant });
    const realAdded = applied?.[ressource] ?? 0;

    const emoji = RESOURCE_EMOJIS[ressource] || "";
    const capped = ressource !== "argent" && realAdded < montant;

    return interaction.editReply(
      capped
        ? `✅ Ajout sur **${targetName}** : **+${Number(realAdded).toLocaleString()}** ${emoji} (cap **${Number(cap).toLocaleString()}**).`
        : `✅ Ajout sur **${targetName}** : **+${Number(realAdded).toLocaleString()}** ${emoji}.`
    );
  } catch (err) {
    console.error(err);
    return interaction.editReply(`⚠️ Erreur : ${err.message}`);
  }
}

async function handleRemove(interaction) {
  const targetUser = interaction.options.getUser("joueur") || interaction.user;
  const targetName = targetUser.username;

  const ressource = (interaction.options.getString("ressource") || "argent").toLowerCase();
  const montant = interaction.options.getInteger("montant");

  await interaction.deferReply();

  if (!montant || montant <= 0) {
    return interaction.editReply("❌ Montant invalide. Mets un nombre entier positif.");
  }
  if (!COLS[ressource]) {
    return interaction.editReply(`❌ Ressource invalide: **${ressource}**. Ressources possibles: ${RESOURCE_KEYS.join(", ")}`);
  }

  try {
    const sheets = await getSheetsClient();
    const rows = await readSheet(sheets);

    const playerRows = getPlayerRowsForRoll(rows, targetName);
    if (!playerRows.length) {
      return interaction.editReply(`👋 Aucun enregistrement trouvé pour **${targetName}** dans le Sheets.`);
    }

    // Lire la ligne ressources actuelle
    const baseRowIndex = playerRows[0].index;
    const rowNumber = 11 + baseRowIndex;
    const range = `${SHEET_NAME}!A${rowNumber}:N${rowNumber}`;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range
    });

    const row = res.data.values?.[0] || [];
    const colIndex = idx(COLS[ressource]);
    const cur = parseCompactNumber(row[colIndex] || "0");

    if (cur < montant) {
      const emoji = RESOURCE_EMOJIS[ressource] || "";
      return interaction.editReply(
        `💸 Solde insuffisant pour **${targetName}** : ` +
        `il/elle a **${Number(cur).toLocaleString()}** ${emoji}, ` +
        `tu veux retirer **${Number(montant).toLocaleString()}**.`
      );
    }

    // Retirer via delta négatif
    const { applied } = await updatePlayerResources(sheets, baseRowIndex, { [ressource]: -montant });
    const realRemoved = Math.abs(applied?.[ressource] ?? 0);

    const emoji = RESOURCE_EMOJIS[ressource] || "";
    const newBalance = cur - realRemoved;

    return interaction.editReply(
      `✅ Retrait sur **${targetName}** : **-${Number(realRemoved).toLocaleString()}** ${emoji}. ` +
      `Nouveau solde : **${Number(newBalance).toLocaleString()}** ${emoji}.`
    );
  } catch (err) {
    console.error(err);
    return interaction.editReply(`⚠️ Erreur : ${err.message}`);
  }
}


// =============================
// DISCORD BOT
// =============================

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // =============================
  // /roll
  // =============================
  if (interaction.commandName === "roll") {
    // ⚠️ handleRoll s'occupe déjà de deferReply + editReply
    return handleRoll(interaction);
  }
  // =============================
  // /argent
  // =============================
  if (interaction.commandName === "argent") {
    return handleArgent(interaction);
  }
  // =============================
  // /remove
  // =============================
  if (interaction.commandName === "remove") {
    return handleRemove(interaction);
  }

  // =============================
  // /add
  // =============================
  if (interaction.commandName === "add") {
    return handleAdd(interaction);
  }

  // =============================
  // /build
  // =============================
  if (interaction.commandName !== "build") return;

  try {
    await interaction.deferReply();

    const building = interaction.options.getString("batiment");
    const player = interaction.user.username;

    const sheets = await getSheetsClient();

    const rows = (await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A11:ZZ`
    })).data.values || [];

    const cities = getPlayerCities(rows, player);

    console.log("JOUEUR:", player);
    console.log(
      "LIGNES TROUVÉES:",
      cities.map(c => ({
        ligne: c.index + 11,
        ville: c.cityName
      }))
    );

    if (!cities.length) {
      return interaction.editReply("❌ Joueur introuvable");
    }

    const resourceCity = cities[0];
    const resourceRow = [...resourceCity.data];

    const buildCity = cities[cities.length - 1];
    const row = [...buildCity.data];

    const lvl = nextLevel(row, building);
    const cfg = BUILD_COSTS[building]?.[lvl];

    if (!cfg) return interaction.editReply("🏗️ Niveau maximum atteint");
    if (!hasCity(row, cfg.requires)) return interaction.editReply("🏛️ Niveau insuffisant");

    if (!canAfford(resourceRow, cfg.costs)) {
      return interaction.editReply("💸 Ressources insuffisantes");
    }

    deduct(resourceRow, cfg.costs);

    row[idx(BUILDING_COLS[building][lvl])] = "En construction";

    rows[resourceCity.index] = resourceRow;
    rows[buildCity.index] = row;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A11:ZZ`,
      valueInputOption: "USER_ENTERED",
      resource: { values: rows }
    });

    await interaction.editReply(
      `🏗️ **${building} niveau ${lvl} lancé dans ${buildCity.cityName} !**`
    );

  } catch (err) {
    console.error("ERREUR BUILD:", err);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("❌ Erreur interne");
    } else {
      await interaction.reply({ content: "❌ Erreur interne", ephemeral: true });
    }
  }
});



client.login(process.env.DISCORD_TOKEN);
