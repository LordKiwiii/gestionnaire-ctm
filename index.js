// =============================
// BOT CTM – INDEX.JS COMPLET
// =============================

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require("discord.js");
const express = require("express");
require("dotenv").config();

// =============================
// EXPRESS (Keep Alive)
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
// NIVEAU DE VILLE
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
  paturage: { 1: "AT", 2: "BG", 3: "BY" },
  carriere_argile: { 1: "AU", 2: "BH", 3: "BX" },
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
const BUILD_COSTS = require("./build_costs"); // séparer dans un fichier pour plus de lisibilité

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
    if (!row[idx(BUILDING_COLS[key][lvl])]) return parseInt(lvl);
  }
  return null;
}

function getPlayerCities(rows, playerName) {
  const cities = [];
  rows.forEach((row, index) => {
    const owner = row[1];      // joueur
    const cityName = row[0];   // nom de la ville
    if (owner === playerName) {
      cities.push({ name: cityName, data: row, index });
    }
  });
  return cities;
}

// =============================
// DISCORD BOT
// =============================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 🔹 Login Ready
client.once("ready", () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
});

// 🔹 Interaction Commande
client.on("interactionCreate", async interaction => {
  if (!interaction.isCommand()) return;

  await interaction.deferReply();

  const player = interaction.options.getString("player");
  const building = interaction.options.getString("batiment");

  if (!player || !building) {
    return interaction.editReply("❌ Paramètres manquants");
  }

  try {
    const sheets = await getSheetsClient();
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A11:CH1000`
    });
    const rows = sheetData.data.values || [];

    const cities = getPlayerCities(rows, player);

    if (!cities.length) return interaction.editReply("❌ Joueur introuvable");

    const resourceCity = cities[0];
    const resourceRow = [...resourceCity.data];

    const buildCity = cities[cities.length - 1];
    const buildRow = [...buildCity.data];

    const lvl = nextLevel(buildRow, building);
    if (!lvl) return interaction.editReply("🏗️ Niveau maximum atteint");

    const cfg = BUILD_COSTS[building]?.[lvl];
    if (!cfg) return interaction.editReply("❌ Coûts non définis");

    if (!hasCity(buildRow, cfg.requires)) return interaction.editReply("🏛️ Niveau de ville insuffisant");
    if (!canAfford(resourceRow, cfg.costs)) return interaction.editReply("💸 Ressources insuffisantes");

    deduct(resourceRow, cfg.costs);
    buildRow[idx(BUILDING_COLS[building][lvl])] = "En construction";

    // 🔁 Update Sheets
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${11 + resourceCity.index}:CH${11 + resourceCity.index}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [resourceRow] }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${11 + buildCity.index}:CH${11 + buildCity.index}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [buildRow] }
    });

    interaction.editReply(`🏗️ **${building} niveau ${lvl} lancé !**`);
  } catch (err) {
    console.error("Erreur lors de la commande :", err);
    interaction.editReply("❌ Une erreur est survenue. Vérifiez les logs.");
  }
});

// 🔹 Login Discord
client.login(process.env.DISCORD_TOKEN);

process.on("unhandledRejection", err => {
  console.error("Unhandled rejection:", err);
});
