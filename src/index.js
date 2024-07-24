require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const { SpeechClient } = require('@google-cloud/speech');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

let rechargeState = {};
let contactState = {};

const client = new SpeechClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

async function transcribeVoice(filePath) {
  const file = fs.readFileSync(filePath);
  const audioBytes = file.toString('base64');

  const audio = {
    content: audioBytes,
  };

  const config = {
    encoding: 'OGG_OPUS',
    sampleRateHertz: 48000,
    languageCode: 'fr-FR',
  };

  const request = {
    audio: audio,
    config: config,
  };

  const [response] = await client.recognize(request);
  const transcription = response.results
    .map(result => result.alternatives[0].transcript)
    .join('\n');
  return transcription;
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (msg.voice) {
    const fileId = msg.voice.file_id;
    const filePath = path.join(__dirname, 'voice_messages', `${fileId}.ogg`);
    const file = await bot.getFileLink(fileId);

    // Téléchargement du fichier vocal
    const response = await axios.get(file, { responseType: 'stream' });
    const stream = fs.createWriteStream(filePath);
    response.data.pipe(stream);

    stream.on('finish', async () => {
      const transcription = await transcribeVoice(filePath);
      bot.sendMessage(chatId, `Transcription du message vocal :\n${transcription}`);
      fs.unlinkSync(filePath);
    });
  } else if (msg.text) {
    handleTextMessage(msg);
  }
});

async function handleTextMessage(msg) {
  const chatId = msg.chat.id;
  const messageText = msg.text;

  if (messageText === "/start") {
    const keyboard = {
      reply_markup: {
        keyboard: [
          ["💰 Solde", "💳 Recharge"],
          ["💸 Retrait", "✉️ Envoi"],
          ["🗣️ Envoyer des sats par voix", "📱 Partager mon contact"],
          ["📇 Enregistrer un contact"],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };
    bot.sendMessage(chatId, "Bienvenue Satoshi! choisi une option :", keyboard);
  } else if (messageText === "💰 Solde") {
    bot.sendMessage(chatId, "Solde actuel : [0 sats]");
  } else if (messageText === "💳 Recharge") {
    bot.sendMessage(chatId, "Combien de sats voulez-vous recharger ?");
    rechargeState[chatId] = true;
  } else if (messageText === "💸 Retrait") {
    bot.sendMessage(chatId, "Combien de sats voulez-vous retirer ?");
  } else if (messageText === "✉️ Envoi") {
    bot.sendMessage(chatId, "Vous avez sélectionné Envoi.");
  } else if (messageText === "🗣️ Envoyer des sats par voix") {
    bot.sendMessage(chatId, "D'accord Satoshi. À qui veux-tu envoyer des sats ? Sois clair dans ta requête.");
    bot.sendMessage(chatId, "Ex : Envoie 200 satoshis à Nakamoto.");
    bot.sendMessage(chatId, "Allons-y! Utilise le micro à côté.");
  } else if (messageText === "📱 Partager mon contact") {
    const contactRequestKeyboard = {
      reply_markup: {
        keyboard: [
          [{ text: "Partager mon contact", request_contact: true }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    };
    bot.sendMessage(chatId, "Cliquez sur le bouton ci-dessous pour partager votre contact :", contactRequestKeyboard);
  } else if (messageText === "📇 Enregistrer un contact") {
    bot.sendMessage(chatId, "Entrez son nom :");
    contactState[chatId] = { step: 1 };
  } else if (contactState[chatId]?.step === 1) {
    contactState[chatId].name = messageText;
    bot.sendMessage(chatId, "Entrez son numéro de téléphone :");
    contactState[chatId].step = 2;
  } else if (contactState[chatId]?.step === 2) {
    contactState[chatId].phone = messageText;
    bot.sendMessage(chatId, `Contact enregistré :\nNom : ${contactState[chatId].name}\nTéléphone : ${contactState[chatId].phone}`);
    delete contactState[chatId];
  } else if (rechargeState[chatId]) {
    const satoshis = parseInt(messageText);
    if (!isNaN(satoshis) && satoshis > 0) {
      const btcRequestData = {
        amount: satoshis,
        title: "Paiement ",
        currency: "SATS",
        email: "saidboda94@gmail.com",
        description: "Paiement ",
      };

      try {
        const btcResponse = await axios.post(
          `${process.env.PAY_API_BASE_URL}/stores/${process.env.PAY_STORE_ID}${process.env.PAY_ENDPOINT}`,
          btcRequestData,
          {
            headers: {
              Authorization: `token ${process.env.BTC_PAY_API_KEY}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          }
        );

        if (btcResponse.status === 200) {
          const paymentRequestId = btcResponse.data.id;
          const confirmPaymentResponse = await axios.post(
            `${process.env.PAY_API_BASE_URL}/stores/${process.env.PAY_STORE_ID}${process.env.PAY_ENDPOINT}/${paymentRequestId}/pay`,
            btcRequestData,
            {
              headers: {
                Authorization: `token ${process.env.BTC_PAY_API_KEY}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
            }
          );

          if (confirmPaymentResponse.status === 200 && confirmPaymentResponse.data.checkoutLink) {
            bot.sendMessage(chatId, "Paiement LN initié avec succès. Cliquez sur le lien suivant pour valider le paiement : " + confirmPaymentResponse.data.checkoutLink);
          }
        } else {
          bot.sendMessage(chatId, "Une erreur est survenue lors de la création de la demande de paiement LN.");
        }
      } catch (error) {
        console.error("Erreur lors du paiement LN :", error);
        bot.sendMessage(chatId, "Une erreur est survenue lors du paiement LN.");
      }

      rechargeState[chatId] = false;
    } else {
      bot.sendMessage(chatId, "Montant invalide. Veuillez entrer un nombre valide de satoshis.");
    }
  } else {
    bot.sendMessage(chatId, "Commande non reconnue. Utilisez les boutons pour interagir.");
  }
}

bot.on("polling_error", (error) => {
  console.error("Erreur de polling:", error);
});

console.log("Le bot a démarré.");
