const express = require("express");

const {
  saveReplyMapping,
  telegramApi,
  telegramApiFile,
  buildTelegramFileProxyUrl
} = require("../replyMapping");
const {
  isAndroidCustomerId,
  appendChatMessage,
  getChatMessages,
  editChatMessage,
  deleteChatMessage,
  popPendingReactions,
  markChatReadByCustomer
} = require("../chatStore");
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
  // internal:true — служебные сообщения только для админа (см.
  // routes/orders.js) — клиенту в приложении их показывать не нужно.
  res.json({ messages: messages.filter((m) => !m.internal) });
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

    // Push в веб-панель оператора — тот же relay, что уже используется для
    // сайтового чата (cosmo-bong-telegram-relay), только без дублирования
    // в Telegram (сообщение туда уже ушло строкой выше). await обязателен —
    // без него serverless-функция Vercel завершается раньше, чем fetch
    // успевает уйти (в отличие от Cloudflare Workers с ctx.waitUntil).
       await fetch("https://cosmo-bong-telegram-relay.chooss9.workers.dev/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "push", text: `Посетитель: ${customerId}\n${adminMessage}` })
    }).catch((e) => console.error("❌ PUSH RELAY ERROR:", e.message));

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

// Клиент отправляет голосовое сообщение из приложения. Файл приходит как
// base64 в JSON-теле (проще, чем городить multipart-загрузку ради коротких
// голосовых сообщений) — здесь превращаем его в реальные байты и шлём
// админу в Telegram методом sendAudio (а не sendVoice: Telegram требует для
// sendVoice формат OGG/OPUS, а запись в приложении идёт в m4a — sendAudio
// принимает m4a/mp3 без перекодирования и всё равно даёт админу
// воспроизводимый файл с кнопкой play).
router.post("/send-voice", async (req, res) => {
  try {
    const { customerId, phone, audioBase64, mimeType } = req.body;

    if (!customerId || !isAndroidCustomerId(String(customerId)) || !audioBase64) {
      return res.status(400).json({ success: false, error: "customerId и audioBase64 обязательны" });
    }

    const buffer = Buffer.from(audioBase64, "base64");

    const caption =
      `🎤 Голосовое сообщение от клиента (Android)` + (phone ? `\n📞 ${phone}` : "");

    const sendResult = await telegramApiFile(
      "sendAudio",
      { chat_id: process.env.ADMIN_ID, caption },
      "audio",
      buffer,
      "voice-message.m4a",
      mimeType || "audio/m4a"
    );

    if (!sendResult.ok || !sendResult.result) {
      console.error("❌ CHAT SEND-VOICE: sendAudio failed:", JSON.stringify(sendResult));
      return res.json({ success: false });
    }

    await saveReplyMapping(sendResult.result.message_id, customerId);

    // Сохраняем это же голосовое в историю чата приложения, чтобы клиент
    // видел свою отправку (как с текстом и фото) — берём file_id из ответа
    // Telegram и превращаем в прямую ссылку через getFile, как и для фото.
    let audioUrl;
    const audioFileId = sendResult.result.audio && sendResult.result.audio.file_id;

    if (audioFileId) {
      const fileInfo = await telegramApi("getFile", { file_id: audioFileId }).catch(() => null);
      if (fileInfo && fileInfo.ok && fileInfo.result && fileInfo.result.file_path) {
        audioUrl = buildTelegramFileProxyUrl(fileInfo.result.file_path);
      }
    }

       await appendChatMessage(customerId, { from: "customer", audioUrl });

      const voiceAdminMessage =
      `🎤 Голосовое сообщение от клиента (Android)` + (phone ? `\n📞 ${phone}` : "");

    await fetch("https://cosmo-bong-telegram-relay.chooss9.workers.dev/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "push", text: `Посетитель: ${customerId}\n${voiceAdminMessage}` })
    }).catch((e) => console.error("❌ PUSH RELAY ERROR (voice):", e.message));

    res.json({ success: true });
  } catch (error) {
    console.error("❌ CHAT SEND-VOICE ERROR:", error.message);
    res.status(500).json({ success: false });
  }
});

// Клиент отправляет фото из галереи или камеры. Файл приходит как base64
// в JSON-теле (тот же подход, что и для голосовых) — превращаем в байты и
// шлём админу в Telegram методом sendPhoto.
router.post("/send-image", async (req, res) => {
  try {
    const { customerId, phone, imageBase64, mimeType } = req.body;

    if (!customerId || !isAndroidCustomerId(String(customerId)) || !imageBase64) {
      return res.status(400).json({ success: false, error: "customerId и imageBase64 обязательны" });
    }

    const buffer = Buffer.from(imageBase64, "base64");

    const caption =
      `📷 Фото от клиента (Android)` + (phone ? `\n📞 ${phone}` : "");

    const sendResult = await telegramApiFile(
      "sendPhoto",
      { chat_id: process.env.ADMIN_ID, caption },
      "photo",
      buffer,
      "chat-image.jpg",
      mimeType || "image/jpeg"
    );

    if (!sendResult.ok || !sendResult.result) {
      console.error("❌ CHAT SEND-IMAGE: sendPhoto failed:", JSON.stringify(sendResult));
      return res.json({ success: false });
    }

    await saveReplyMapping(sendResult.result.message_id, customerId);

    // Сохраняем это же фото в историю чата приложения, чтобы клиент видел
    // свою отправку — берём file_id самого крупного варианта из photo[] и
    // превращаем в прямую ссылку через getFile.
    let imageUrl;
    const photos = sendResult.result.photo;
    const photoFileId = photos && photos.length > 0 && photos[photos.length - 1].file_id;

    if (photoFileId) {
      const fileInfo = await telegramApi("getFile", { file_id: photoFileId }).catch(() => null);
      if (fileInfo && fileInfo.ok && fileInfo.result && fileInfo.result.file_path) {
        imageUrl = buildTelegramFileProxyUrl(fileInfo.result.file_path);
      }
    }

       await appendChatMessage(customerId, { from: "customer", imageUrl });

       const imageAdminMessage =
      `📷 Фото от клиента (Android)` + (phone ? `\n📞 ${phone}` : "");

    await fetch("https://cosmo-bong-telegram-relay.chooss9.workers.dev/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "push", text: `Посетитель: ${customerId}\n${imageAdminMessage}` })
    }).catch((e) => console.error("❌ PUSH RELAY ERROR (image):", e.message));

    res.json({ success: true });
  } catch (error) {
    console.error("❌ CHAT SEND-IMAGE ERROR:", error.message);
    res.status(500).json({ success: false });
  }
});

// Клиент редактирует своё уже отправленное текстовое сообщение — только в
// приложении, в Telegram у админа старый текст останется без изменений.
// Идентифицируем сообщение по createdAt (уникален для сообщений клиента).
router.post("/edit", async (req, res) => {
  try {
    const { customerId, createdAt, text } = req.body;

    if (!customerId || !isAndroidCustomerId(String(customerId)) || !createdAt || !text) {
      return res.status(400).json({ success: false, error: "customerId, createdAt и text обязательны" });
    }

    const ok = await editChatMessage(customerId, Number(createdAt), text);
    res.json({ success: ok });
  } catch (error) {
    console.error("❌ CHAT EDIT ERROR:", error.message);
    res.status(500).json({ success: false });
  }
});

// Клиент удаляет своё сообщение — только в приложении.
router.post("/delete", async (req, res) => {
  try {
    const { customerId, createdAt } = req.body;

    if (!customerId || !isAndroidCustomerId(String(customerId)) || !createdAt) {
      return res.status(400).json({ success: false, error: "customerId и createdAt обязательны" });
    }

    const ok = await deleteChatMessage(customerId, Number(createdAt));
    res.json({ success: ok });
  } catch (error) {
    console.error("❌ CHAT DELETE ERROR:", error.message);
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

// Клиент реально открыл чат и увидел сообщения — вызывается из приложения
// при фокусе на экране чата (см. ChatScreen.tsx). Ставим 👍 на все
// накопленные с прошлого раза сообщения админа в Telegram-боте — это
// единственный момент, когда админ узнаёт, что клиент точно прочитал ответ
// (а не просто "push доставлен", что не одно и то же).
router.post("/mark-read", async (req, res) => {
  try {
    const { customerId } = req.body;

    if (!customerId || !isAndroidCustomerId(String(customerId))) {
      return res.status(400).json({ success: false, error: "customerId обязателен" });
    }

     const pendingMessageIds = await popPendingReactions(customerId);
    await markChatReadByCustomer(customerId);

    await Promise.all(
      pendingMessageIds.map((messageId) =>
        telegramApi("setMessageReaction", {
          chat_id: process.env.ADMIN_ID,
          message_id: Number(messageId),
          reaction: [{ type: "emoji", emoji: "👍" }]
        }).catch(() => {})
      )
    );

    res.json({ success: true });
  } catch (error) {
    console.error("❌ CHAT MARK-READ ERROR:", error.message);
    res.status(500).json({ success: false });
  }
});

// Приложение регистрирует Expo push-токен устройства — без него сообщения
// админа не смогут дойти push-уведомлением (клиент увидит их только когда
// сам откроет чат).
router.post("/push-token", async (req, res) => {
  try {
    const { customerId, token, platform } = req.body;

    if (!customerId || !isAndroidCustomerId(String(customerId)) || !token) {
      return res.status(400).json({ success: false, error: "customerId и token обязательны" });
    }

    await savePushToken(customerId, token, platform === "web" ? "web" : "android");
    res.json({ success: true });
  } catch (error) {
    console.error("❌ PUSH TOKEN ERROR:", error.message);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
