const express = require("express");

const { saveReplyMapping, telegramApi } = require("../replyMapping");
const { isAndroidCustomerId, appendChatMessage, getChatMessages } = require("../chatStore");
const { savePushToken } = require("../pushStore");
const { getAwaitingShippingData } = require("../orderStore");
const {
  confirmOrderByCustomer,
  selectDeliveryMethodByCustomer,
  submitShippingDataText
} = require("../orderFlow");

const router = express.Router();

// История переписки клиента с админом — подгружается при открытии чата
// в приложении и периодически (поллингом) для новых сообщений. Сообщения
// админа могут содержать кнопки (сценарий заказа — подтверждение, выбор
// доставки) или фото (QR-код для оплаты) — см. chatStore.appendChatMessage.
router.get("/history", async (req, res) => {
  const customerId = req.query.customerId;

  if (!customerId || !isAndroidCustomerId(String(customerId))) {
    return res.status(400).json({ error: "customerId обязателен" });
  }

  const messages = await getChatMessages(String(customerId));
  res.json({ messages });
});

// Клиент отправляет сообщение из приложения. Если клиент как раз должен
// был прислать данные получателя (после выбора СДЭК/Почты в сценарии
// заказа — см. selectDeliveryMethodByCustomer) — это сообщение уходит в
// тот же сценарий заказа (submitShippingDataText), что и в Telegram.
// Иначе — обычное сообщение поддержки, пересылается админу в Telegram-бот.
// В обоих случаях сообщение сохраняется в историю чата, чтобы клиент видел
// свою же переписку.
router.post("/send", async (req, res) => {
  try {
    const { customerId, phone, text } = req.body;

    if (!customerId || !isAndroidCustomerId(String(customerId)) || !text) {
      return res.status(400).json({ success: false, error: "customerId и text обязательны" });
    }

    await appendChatMessage(customerId, { from: "customer", text });

    const awaitingOrderId = await getAwaitingShippingData(customerId);

    if (awaitingOrderId) {
      await submitShippingDataText(customerId, text);
      return res.json({ success: true });
    }

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

// Клиент нажал кнопку в чате (тот же сценарий заказа, что и инлайн-кнопки
// в Telegram — см. server/orderFlow.js). Разрешены только кнопки, которые
// в сценарии нажимает именно клиент (подтверждение заказа, выбор способа
// доставки/оплаты) — остальные действия (принять/оплачен/отправлен и т.д.)
// доступны только админу через Telegram.
router.post("/button", async (req, res) => {
  try {
    const { customerId, callbackData } = req.body;

    if (!customerId || !isAndroidCustomerId(String(customerId)) || !callbackData) {
      return res.status(400).json({ success: false, error: "customerId и callbackData обязательны" });
    }

    const parts = String(callbackData).split(":");
    const action = parts[0];

    let result;

    if (action === "order_confirm") {
      result = await confirmOrderByCustomer(parts[1]);
    } else if (action === "order_method") {
      result = await selectDeliveryMethodByCustomer(parts[1], parts[2]);
    } else {
      return res.status(403).json({ success: false, error: "Действие недоступно" });
    }

    res.json({ success: !!result.ok, reason: result.reason });
  } catch (error) {
    console.error("❌ CHAT BUTTON ERROR:", error.message);
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
