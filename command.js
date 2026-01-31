const { REST, Routes } = require("discord.js");
require("dotenv").config();

const commands = [
  {
    name: "roll",
    description: "Lancer la récolte de ressources"
  },
  {
    name: "argent",
    description: "Lancer les revenus journaliers en pièces d'argent (par ville)"
  },
  {
    name: "add",
    description: "Ajouter directement des pièces d'argent à ton compte",
    options: [
      {
        name: "montant",
        description: "Montant d'argent à ajouter",
        type: 4, // INTEGER
        required: true
      }
    ]
  },

  {
    name: "build",
    description: "Construire un bâtiment",
    options: [
      {
        name: "batiment",
        description: "Bâtiment à construire",
        type: 3, // STRING
        required: true,
        choices: [

          // ===== PRODUCTION =====
          { name: "Scierie", value: "scierie" },
          { name: "Ferme", value: "ferme" },
          { name: "Carrière de pierre", value: "carriere_pierre" },
          { name: "Atelier de tanneur", value: "atelier_tanneur" },
          { name: "Pâturage", value: "paturage" },
          { name: "Carrière d'argile", value: "carriere_argile" },
          { name: "Mine de fer", value: "mine_fer" },
          { name: "Mine de sel", value: "mine_sel" },
          { name: "Atelier de poterie", value: "atelier_poterie" },

          // ===== STOCKAGE =====
          { name: "Entrepôt", value: "entrepot" },

          // ===== VILLES =====
          { name: "Village", value: "village" },
          { name: "Bourg", value: "bourg" },
          { name: "Ville", value: "ville" },
          { name: "Cité", value: "cite" },

          // ===== MILITAIRE =====
          { name: "Camp militaire", value: "camp_militaire" },
          { name: "Caserne militaire", value: "caserne_militaire" },
          { name: "Quartier militaire", value: "quartier_militaire" },
          { name: "Bastion militaire", value: "bastion_militaire" },
          { name: "Forteresse militaire", value: "forteresse_militaire" }

        ]
      }
    ]
  }
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔁 Enregistrement des slash commands...");

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("✅ Slash commands enregistrées avec succès !");
  } catch (error) {
    console.error("❌ Erreur :", error);
  }
})();
