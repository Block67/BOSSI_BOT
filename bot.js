
  if (messageText === '/start') {
    const keyboard = {
      reply_markup: {
        keyboard: [
          ['💰 Solde', '💳 Recharge'],
          ['💸 Retrait', '✉️ Envoi'],
          ['🎤 Envoyer note vocale']
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    };
  
    bot.sendMessage(chatId, 'Bienvenue ! Sélectionnez une option :', keyboard);
  }
 