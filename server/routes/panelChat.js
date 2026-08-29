const express = require("express");

const {
  isAndroidCustomerId,
  appendChatMessage,
  getChatMessages,
  getAndroidChatList,
  getChatMeta,
  markCustomerMessagesRead
} = require("../chatStore");
const {
  panelAcceptOrder,
  panelMarkPaid,
  panelMarkShipped,
  panelMarkReady,
  panelEditOrder,
  panelCancelOrder,
  panelCalcOrder,
  panelChooseBankAndInvoice
} = require("../orderFlow");
const { getOrder } = require("../orderStore");
const { saveReplyMapping, telegramApi } = require("../replyMapping");
const { getPushToken, sendExpoPush, sendWebPush, listAndroidInstalls } = require("../pushStore");

const router = express.Router();

// Единая защита всех эндпоинтов панели — простой секрет в заголовке,
// сравнивается с PANEL_SECRET в переменных окружения Vercel. Не query-
// параметр (?secret=...), чтобы не светился в логах/истории браузера при
// поллинге.
router.use((req, res, next) => {
  const secret = req.headers["x-panel-secret"];
  if (!secret || !process.env.PANEL_SECRET || secret !== process.env.PANEL_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

// Список Android-чатов для вкладки "Android" в панели — поллингом,
// сортировка по свежести последнего сообщения (см. chatStore.getAndroidChatList).
router.get("/list", async (req, res) => {
  const chats = await getAndroidChatList();
  res.json({ chats });
});

// История конкретного чата — открытие чата в панели одновременно считается
// прочтением (как и в приложении при mark-read), поэтому здесь же сбрасываем
// unread и read:true у сообщений клиента.
router.get("/history", async (req, res) => {
  const customerId = req.query.customerId;

  if (!customerId || !isAndroidCustomerId(String(customerId))) {
    return res.status(400).json({ error: "customerId обязателен" });
  }

  const messages = await getChatMessages(String(customerId));
  const meta = await getChatMeta(String(customerId));
  await markCustomerMessagesRead(String(customerId));

  res.json({ messages, lastReadByCustomerAt: meta.lastReadByCustomerAt || 0 });
});

// Админ отвечает клиенту прямо из панели (не из Telegram). Делаем то же,
// что и обычная Telegram-ветка в webhook'е (см. server/index.js): пишем
// сообщение в Redis-чат + пушим клиенту. Дополнительно (по решению
// Cosmo) дублируем в Telegram как обычное сообщение с пометкой источника —
// чтобы у админа не терялась история, если он потом продолжит отвечать
// уже из Telegram; saveReplyMapping делает такой Reply рабочим.
router.post("/send", async (req, res) => {
  try {
    const { customerId, text } = req.body;

    if (!customerId || !isAndroidCustomerId(String(customerId)) || !text) {
      return res.status(400).json({ success: false, error: "customerId и text обязательны" });
    }

    await appendChatMessage(customerId, { from: "admin", text });

    const phone = String(customerId).startsWith("android:")
      ? String(customerId).slice("android:".length)
      : customerId;

    const mirrorResult = await telegramApi("sendMessage", {
      chat_id: process.env.ADMIN_ID,
      text: `🖥 Ответ из панели (Android)\n📞 ${phone}\n\n${text}`
    }).catch((err) => ({ ok: false, description: err.message }));

    if (mirrorResult.ok && mirrorResult.result) {
      // Дальше на ЭТО сообщение тоже можно ответить Reply из Telegram —
      // уйдёт тому же клиенту, как и на обычные пересланные сообщения.
      await saveReplyMapping(mirrorResult.result.message_id, customerId);
    }

    const androidToken = await getPushToken(customerId, "android");
    const pushResult = await sendExpoPush(androidToken, {
      title: "Cosmo Bong",
      body: text,
      data: { type: "chat" }
    });

    const webToken = await getPushToken(customerId, "web");
    if (webToken) {
      await sendWebPush(webToken, { title: "Cosmo Bong", body: text });
    }

    res.json({ success: true, pushDelivered: !!(pushResult && pushResult.ok) });
  } catch (error) {
    console.error("❌ PANEL CHAT SEND ERROR:", error.message);
    res.status(500).json({ success: false });
  }
});

// Админ отправляет фото клиенту из панели (уже загруженное на ImgBB —
// панель делает загрузку сама, как и для сайтового чата, сюда приходит
// готовая ссылка). Дублируем в Telegram и шлём push — как и в /send.
router.post("/send-image", async (req, res) => {
  try {
    const { customerId, imageUrl } = req.body;

    if (!customerId || !isAndroidCustomerId(String(customerId)) || !imageUrl) {
      return res.status(400).json({ success: false, error: "customerId и imageUrl обязательны" });
    }

    await appendChatMessage(customerId, { from: "admin", imageUrl });

    const phone = String(customerId).startsWith("android:")
      ? String(customerId).slice("android:".length)
      : customerId;

    const mirrorResult = await telegramApi("sendPhoto", {
      chat_id: process.env.ADMIN_ID,
      photo: imageUrl,
      caption: `🖥 Ответ из панели (Android)\n📞 ${phone}`
    }).catch((err) => ({ ok: false, description: err.message }));

    if (mirrorResult.ok && mirrorResult.result) {
      await saveReplyMapping(mirrorResult.result.message_id, customerId);
    }

    const androidToken = await getPushToken(customerId, "android");
    const pushResult = await sendExpoPush(androidToken, {
      title: "Cosmo Bong",
      body: "📷 Фото",
      data: { type: "chat" }
    });

    const webToken = await getPushToken(customerId, "web");
    if (webToken) {
      await sendWebPush(webToken, { title: "Cosmo Bong", body: "📷 Фото" });
    }

        await fetch("https://cosmo-bong-telegram-relay.chooss9.workers.dev/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "push", text: `Посетитель: ${customerId}\n🖥 Фото из панели (Android)\n📞 ${phone}` })
    }).catch((e) => console.error("❌ PUSH RELAY ERROR (panel image):", e.message));

    res.json({ success: true, pushDelivered: !!(pushResult && pushResult.ok) });
  } catch (error) {
    console.error("❌ PANEL CHAT SEND-IMAGE ERROR:", error.message);
    res.status(500).json({ success: false });
  }
});

// Действия по заказу (кнопки Принять/Оплачен/Отправлен/Изменить/Отменить)
// из веб-панели — та же логика, что в Telegram callback_query, только без
// привязки к Telegram-сессии. extra — доп. данные для сложных действий
// (трек-номер для "shipped", новый состав/сумма текстом для "edit").
router.post("/order-action", async (req, res) => {
  try {
    const { orderId, action, extra } = req.body;

    if (!orderId || !action) {
      return res.status(400).json({ success: false, error: "orderId и action обязательны" });
    }

    // "ready" вместо "shipped" — для заказов с самовывозом (см.
    // buildOrderActionButtons: там вторая кнопка либо "Отправлен", либо
    // "Собран" в зависимости от deliveryMethod).
    let result;

    if (action === "accept") {
      result = await panelAcceptOrder(orderId);
    } else if (action === "paid") {
      result = await panelMarkPaid(orderId);
    } else if (action === "shipped") {
      const order = await getOrder(orderId);
      result = order && order.deliveryMethod === "pickup_yar"
        ? await panelMarkReady(orderId)
        : await panelMarkShipped(orderId, extra);
    } else if (action === "edit") {
      result = await panelEditOrder(orderId, extra);
        } else if (action === "cancel") {
      result = await panelCancelOrder(orderId);
    } else if (action === "calc") {
      result = await panelCalcOrder(orderId);
    } else if (action === "bank") {
      // extra ожидается в формате "sber|450, 4" или "raif|450, 4" —
      // банк и текст "стоимость, срок" вместе одним запросом, панель
      // собирает его после двух подряд идущих подсказок пользователю.
      const [bank, ...rest] = String(extra || "").split("|");
      result = await panelChooseBankAndInvoice(orderId, bank, rest.join("|"));
    } else {
      return res.status(400).json({ success: false, error: "Неизвестное действие" });
    }

       res.json({ success: !!(result && result.ok), reason: result && result.reason });
  } catch (error) {
    console.error("❌ PANEL ORDER ACTION ERROR:", error.message);
    res.status(500).json({ success: false });
  }
});

// Список клиентов, установивших Android-приложение (есть push-токен) —
// для вкладки "Установки" в панели.
router.get("/installs", async (req, res) => {
  const installs = await listAndroidInstalls();
  res.json({ installs });
});

module.exports = router;