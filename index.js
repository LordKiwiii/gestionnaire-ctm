// =============================
// BOT CTM – Multi-villes & Google Sheets
// =============================

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const express = require("express");
require("dotenv").config();

// =============================
// EXPRESS (Render / Uptime)
// =============================

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 Bot CTM Discord actif !");
});

app.listen(PORT, () => {
  console.log(`🌐 Serveur web actif sur le port ${PORT}`);
});

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

const COLS = {
  poterie: "C",
  fer: "D",
  sel: "E",
  argile: "F",
  laine: "G",
  fourrure: "H",
  pierre: "I",
  nourriture: "J",
  bois: "K",
  argent: "N"
};

const BUILDING_COLS = {
  scierie: { 1: "X", 2: "AF", 3: "AP", 4: "BC", 5: "BT" },
  ferme: { 1: "Y", 2: "AG", 3: "AQ", 4: "BD", 5: "BU" },
  carriere_pierre: { 1: "AH", 2: "AR", 3: "BE", 4: "BV" },
  atelier_tanneur: { 1: "AI", 2: "AS", 3: "BF", 4: "BW" },
  paturage: { 1: "AT", 2: "BG", 3: "BY" },
  carriere_argile: { 1: "AU", 2: "BH", 3: "BX" },
  mine_sel: { 1: "BI", 2: "BZ" },
  mine_fer: { 1: "BJ", 2: "CA" },
  atelier_poterie: { 1: "BK", 2: "CB" }
};

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

// =============================
// COUTS DES BATIMENTS
// =============================

const BUILD_COSTS = {
  scierie: {
    1: { argent: 500 },
    2: { argent: 1000, bois: 500, nourriture: 500, pierre: 500 },
    3: { argent: 1500, bois: 1000, nourriture: 1000, pierre: 1000, argile: 500 },
    4: { argent: 2000, bois: 1500, nourriture: 1500, pierre: 1500, argile: 1000, fer: 500 },
    5: { argent: 2500, bois: 2000, nourriture: 2000, pierre: 2000, argile: 1500, fer: 1000 }
  },

  ferme: {
    1: { argent: 500, bois: 400 },
    2: { argent: 1200, bois: 800, nourriture: 700, pierre: 600 },
    3: { argent: 1800, bois: 1400, nourriture: 1300, pierre: 1200, laine: 500 },
    4: { argent: 2400, bois: 2000, nourriture: 1900, pierre: 1800, laine: 1100, sel: 400, poterie: 400 },
    5: { argent: 3000, bois: 2600, nourriture: 2500, pierre: 2400, laine: 1700, sel: 1000, poterie: 1000 }
  },

  carriere_pierre: {
    1: { argent: 1500, bois: 1000, nourriture: 1000 },
    2: { argent: 2000, bois: 1500, nourriture: 1500, pierre: 1000, argile: 500 },
    3: { argent: 2500, bois: 2000, nourriture: 2000, pierre: 1500, argile: 1000, fer: 500 },
    4: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, argile: 1500, fer: 1000 }
  },

  atelier_tanneur: {
    1: { argent: 1500, bois: 1000, nourriture: 1000, pierre: 600 },
    2: { argent: 2000, bois: 1500, nourriture: 1500, pierre: 1500, laine: 500 },
    3: { argent: 2500, bois: 2000, nourriture: 2000, pierre: 1500, laine: 1000, fer: 500, sel: 500 },
    4: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, argile: 1500, fer: 1000, sel: 1000 }
  },

  paturage: {
    1: { argent: 2000, bois: 1500, nourriture: 1500, pierre: 1000, fourrure: 1000 },
    2: { argent: 2500, bois: 2000, nourriture: 2000, pierre: 1500, fourrure: 1500, fer: 500, sel: 500, laine: 500 },
    3: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, fourrure: 1500, fer: 1000, sel: 1000, laine: 1000 }
  },

  carriere_argile: {
    1: { argent: 2000, bois: 1500, nourriture: 1500, pierre: 1000, fourrure: 500 },
    2: { argent: 2500, nourriture: 2000, pierre: 1500, fourrure: 1500, argile: 1000, fer: 500 },
    3: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, fourrure: 1500, argile: 1500, fer: 1000 }
  },

  mine_fer: {
    1: { argent: 2500, nourriture: 2000, pierre: 1500, fourrure: 1500, argile: 1000 },
    2: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, fourrure: 1500, argile: 1500, fer: 1000 }
  },

  mine_sel: {
    1: { argent: 2500, nourriture: 2000, pierre: 1500, fourrure: 1500, argile: 1000, fer: 500 },
    2: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, fourrure: 1500, argile: 1500, fer: 1000 }
  },

  atelier_poterie: {
    1: { argent: 2500, nourriture: 2000, pierre: 1500, fourrure: 1500, argile: 2000, laine: 500 },
    2: { argent: 3000, bois: 2500, nourriture: 2500, pierre: 2000, fourrure: 1500, argile: 1500, fer: 1000, laine: 1000 }
  }
};

// =============================
// UTILITAIRES
// =============================

function letterToIndex(letter) {
  let index = 0;
  for (let i = 0; i < letter.length; i++) {
    index = index * 26 + (letter.charCodeAt(i) - 64);
  }
  return index - 1;
}

function rollDice(dice, mult) {
  return (Math.floor(Math.random() * dice) + 1) * mult;
}

function gainForBuilding(lvl) {
  const cfg = LEVEL_CONFIG[lvl] || LEVEL_CONFIG[1];
  return rollDice(cfg.dice, cfg.mult);
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: authData,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return google.sheets({ version: "v4", auth });
}

async function readSheet(sheets) {
  const range = `${SHEET_NAME}!A11:CH`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return res.data.values || [];
}

function getPlayerCities(rows, playerName) {
  const cities = [];
  let found = false;

  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i][letterToIndex(PLAYER_NAME_COL)];
    if (cell && cell.trim() === playerName.trim()) {
      found = true;
      cities.push({ index: i, data: rows[i] });
      continue;
    }
    if (found) {
      if (cell && cell.trim() !== "") break;
      cities.push({ index: i, data: rows[i] });
    }
  }
  return cities;
}

function detectBuildingLevels(row) {
  const levels = {};
  for (const [bat, lvlCols] of Object.entries(BUILDING_COLS)) {
    let max = 0;
    for (const [lvl, col] of Object.entries(lvlCols)) {
      const val = row[letterToIndex(col)];
      if (val && val.toLowerCase().includes("terminé")) {
        max = Math.max(max, parseInt(lvl));
      }
    }
    levels[bat] = max;
  }
  return levels;
}

function calcTotalGains(cities) {
  const totals = {};
  for (const city of cities) {
    const lvls = detectBuildingLevels(city.data);
    for (const [bat, lvl] of Object.entries(lvls)) {
      if (lvl > 0) {
        const res = BUILD_RESOURCE[bat];
        const gain = gainForBuilding(lvl);
        totals[res] = (totals[res] || 0) + gain;
      }
    }
  }
  return totals;
}

async function updatePlayerResources(sheets, baseRowIndex, updates) {
  const rowNumber = 11 + baseRowIndex;
  const range = `${SHEET_NAME}!A${rowNumber}:N${rowNumber}`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  const row = res.data.values?.[0] || [];

  for (const [key, delta] of Object.entries(updates)) {
    const idx = letterToIndex(COLS[key]);
    const cur = parseInt((row[idx] || "0").replace(/\D/g, "")) || 0;
    row[idx] = String(cur + delta);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    resource: { values: [row] }
  });
}

function getNextBuildLevel(row, buildingKey) {
  const cols = BUILDING_COLS[buildingKey];
  for (const lvl of Object.keys(cols)) {
    const val = row[letterToIndex(cols[lvl])];
    if (!val || val.trim() === "") return parseInt(lvl);
  }
  return null;
}

function canAfford(row, costs) {
  return Object.entries(costs).every(([res, cost]) => {
    const idx = letterToIndex(COLS[res]);
    const cur = parseInt((row[idx] || "0").replace(/\D/g, "")) || 0;
    return cur >= cost;
  });
}

function deductCosts(row, costs) {
  for (const [res, cost] of Object.entries(costs)) {
    const idx = letterToIndex(COLS[res]);
    const cur = parseInt((row[idx] || "0").replace(/\D/g, "")) || 0;
    row[idx] = String(cur - cost);
  }
}

// =============================
// COMMANDES
// =============================

async function handleRoll(interaction) {
  const playerName = interaction.user.username;
  await interaction.deferReply();

  const sheets = await getSheetsClient();
  const rows = await readSheet(sheets);
  const cities = getPlayerCities(rows, playerName);

  if (!cities.length) {
    return interaction.editReply("❌ Joueur introuvable.");
  }

  const gains = calcTotalGains(cities);
  await updatePlayerResources(sheets, cities[0].index, gains);

  const fields = Object.entries(gains).map(([r, v]) => ({
    name: `${RESOURCE_EMOJIS[r]} ${r}`,
    value: `+${v}`,
    inline: true
  }));

  const embed = new EmbedBuilder()
    .setTitle("🎲 Récolte")
    .addFields(fields)
    .setColor(0x00cc66);

  await interaction.editReply({ embeds: [embed] });
}

async function handleBuild(interaction) {
  const buildingKey = interaction.options.getString("batiment");
  const playerName = interaction.user.username;

  await interaction.deferReply();

  const sheets = await getSheetsClient();
  const rows = await readSheet(sheets);
  const cities = getPlayerCities(rows, playerName);

  if (!cities.length) {
    return interaction.editReply("❌ Joueur introuvable.");
  }

  const city = cities[cities.length - 1]; 
  const row = [...city.data];

  const nextLvl = getNextBuildLevel(row, buildingKey);
  if (!nextLvl) {
    return interaction.editReply("🏗️ Niveau maximum atteint.");
  }

  const costs = BUILD_COSTS[buildingKey]?.[nextLvl];
  if (!costs || !canAfford(row, costs)) {
    return interaction.editReply("💸 Ressources insuffisantes.");
  }

  deductCosts(row, costs);
  row[letterToIndex(BUILDING_COLS[buildingKey][nextLvl])] = "En construction";

  const rowNumber = 11 + city.index;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A${rowNumber}:CH${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    resource: { values: [row] }
  });

  await interaction.editReply(`🏗️ **${buildingKey} niveau ${nextLvl} lancé !**`);
}

// =============================
// DISCORD BOT
// =============================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === "roll") await handleRoll(interaction);
  if (interaction.commandName === "build") await handleBuild(interaction);
});

client.login(process.env.DISCORD_TOKEN);
