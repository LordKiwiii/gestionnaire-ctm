// =============================
// BOT CTM – INDEX.JS COMPLET
// =============================

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

const SHEET_ID = "147GKy0bMGftEbbTKxd3x_XVEnq-HANMdRWfGVcvrR0g";
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
// DISCORD BOT
// =============================

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "build") return;

  try {
    await interaction.deferReply({ ephemeral: true });

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
      interaction.editReply("❌ Erreur interne");
    }
  }
});



client.login(process.env.DISCORD_TOKEN);
