const express = require("express");

const { saveReplyMapping, telegramApi } = require("../replyMapping");
const { isAndroidCustomerId, appendChatMessage, getChatMessages } = require("../chatStore");
const { savePushToken } = require("../pushStore");

const router = express.Router();

// История переписки клиента с админом — подгружается при открытии чата
// в приложении и периодически (поллингом) для новых сообщений.
router.get("/history", async (req, res) => {
  const customerId = req.query.customerId;

  if (!customerId || !isAndroidCustomerId(String(customerId))) {
    return res.status(400).json({ error: "customerId обязателен" });
  }

  const messages = await getChatMessages(String(customerId));
  res.json({ messages });
});

// Клиент отправляет сообщение из приложения — сохраняем в историю чата и
// пересылаем админу в Telegram-бот. Reply админа на это сообщение
// доставится клиенту push-уведомлением (см. /api/telegram-webhook).
router.post("/send", async (req, res) => {
  try {
    const { customerId, phone, text } = req.body;

    if (!customerId || !isAndroidCustomerId(String(customerId)) || !text) {
      return res.status(400).json({ success: false, error: "customerId и text обязательны" });
    }

    await appendChatMessage(customerId, { from: "customer", text });

    const adminMessage =
      `💬 Сообщение от клиента (Android)\n` +
      (phone ? `📞 ${phone}\n\n` : "\n") +
      text;

    const sendResult = await telegramApi("sendMessage", {
      chat_id: process.env.ADMIN_ID,
      text: adminMessage
    });

    if (sendResult.ok && sendResult.result) {
      // Reply админа на ЭТО сообщение уйдёт именно этому клиенту
      await saveReplyMapping(sendResult.result.message_id, customerId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("❌ CHAT SEND ERROR:", error.message);
    res.status(500).json({ success: false });
  }
});

// Приложение регистрирует Expo push-токен устройства — без него сообщения
// админа не смогут дойти push-уведомлением (клиент увидит их только когда
// сам откроет чат).
router.post("/push-token", async (req, res) => {
  try {
    const { customerId, token } = req.body;

    if (!customerId || !isAndroidCustomerId(String(customerId)) || !token) {
      return res.status(400).json({ success: false, error: "customerId и token обязательны" });
    }

    await savePushToken(customerId, token);
    res.json({ success: true });
  } catch (error) {
    console.error("❌ PUSH TOKEN ERROR:", error.message);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
