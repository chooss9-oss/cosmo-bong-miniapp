const { saveReplyMapping, telegramApi } = require("./replyMapping");

const {
  STATUS_LABELS,
  getOrder,
  updateOrder,
  updateOrderStatus,
  saveTrackingRequest,
  getTrackingRequest,
  saveAwaitingShippingData,
  getAwaitingShippingData,
  clearAwaitingShippingData
} = require("./orderStore");

// ==============================
// Полный сценарий обработки заказа кнопками в Telegram:
// Принят -> клиент подтверждает -> выбор доставки/оплаты ->
// данные получателя -> расчёт доставки -> оплачен -> отправлен (трек)
// ==============================

const METHOD_LABELS = {
  cdek_qr: "СДЭК + оплата по QR",
  pochta_qr: "Почта + оплата по QR",
  cdek_transfer: "СДЭК + перевод на карту",
  pochta_transfer: "Почта + перевод на карту",
  pickup_yar: "Самовывоз в Ярославле",
  delivery_yar: "Доставка по Ярославлю"
};

async function clearButtons(chatId, messageId) {
  try {
    await telegramApi("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] }
    });
  } catch (error) {
    console.log("orderFlow: clearButtons failed:", error.message);
  }
}

async function notifyAdmin(text, extraReplyMarkup) {

  const result = await telegramApi("sendMessage", {
    chat_id: process.env.ADMIN_ID,
    text,
    reply_markup: extraReplyMarkup
  });

  return result;

}

async function notifyCustomer(order, text, replyMarkup) {

  if (!order.telegramUserId) return { ok: false };

  const result = await telegramApi("sendMessage", {
    chat_id: order.telegramUserId,
    text,
    reply_markup: replyMarkup
  });

  if (!result.ok) {

    console.log("orderFlow: notifyCustomer FAILED:", JSON.stringify(result));

    await notifyAdmin(
      `⚠️ Не удалось отправить сообщение клиенту по заказу #${order.id} (вероятно, бот не разрешён). Свяжитесь по телефону.`
    );

  }

  return result;

}

// ==============================
// callback_query — нажатия на инлайн-кнопки
// ==============================
async function handleOrderCallback(callbackQuery) {

  const data = String(callbackQuery.data || "");
  const parts = data.split(":");
  const action = parts[0];
  const fromChatId = String(callbackQuery.message?.chat?.id || "");
  const messageId = callbackQuery.message?.message_id;
  const adminId = String(process.env.ADMIN_ID || "").replace(/\D/g, "");
  const clickerId = String(callbackQuery.from?.id || "").replace(/\D/g, "");

  async function ack(text) {
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text
    });
  }

  // ---- Админ принимает заказ (проверил наличие) ----
  if (action === "order_accept") {

    const orderId = parts[1];

    if (clickerId !== adminId) {
      await ack("Недоступно");
      return;
    }

    const order = await getOrder(orderId);

    if (!order) {
      await ack("Заказ не найден");
      return;
    }

    await ack("Заказ принят в работу");

    // Кнопки "Оплачен"/"Отправлен" остаются доступны — убираем только
    // саму кнопку "Принять заказ"
    await telegramApi("editMessageReplyMarkup", {
      chat_id: fromChatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "💰 Оплачен", callback_data: `order_paid:${orderId}` },
            { text: "📦 Отправлен", callback_data: `order_shipped:${orderId}` }
          ]
        ]
      }
    });

    const orderLabel = order.storelandOrderNum || order.id;

    const welcomeText =
`👋 Приветствую! Заказ №${orderLabel} получили и готовы собирать.

📦 Отправляем по 100% предоплате, доставляем Почтой или СДЭК (от 350₽, от 2 дней), оплата переводом на карту или по QR.

После отправления заказа пришлём трек-номер для отслеживания.
Если есть вопросы — пиши прямо в боте, разберёмся и быстро поможем✨

❗️ Подтвердите заказ в течение 24 часов. Если мы не дождёмся подтверждения, то заказ отменим.`;

    const sendResult = await notifyCustomer(order, welcomeText, {
      inline_keyboard: [[{ text: "✅ Заказ подтверждаю", callback_data: `order_confirm:${orderId}` }]]
    });

    if (sendResult.ok) {
      await saveReplyMapping(sendResult.result.message_id, order.telegramUserId);
    }

    return;

  }

  // ---- Клиент подтверждает заказ — сразу отправляем выбор доставки/оплаты ----
  // (наличие уже проверено админом на шаге "Принять заказ", поэтому
  // дополнительного шага подтверждения от админа здесь не нужно)
  if (action === "order_confirm") {

    const orderId = parts[1];
    const order = await getOrder(orderId);

    if (!order) {
      await ack("Заказ не найден");
      return;
    }

    await ack("Спасибо за подтверждение!");
    await clearButtons(fromChatId, messageId);
    await updateOrderStatus(orderId, "confirmed");

    const orderLabel = order.storelandOrderNum || order.id;

    await notifyAdmin(`✅ Клиент подтвердил заказ №${orderLabel}. Отправил ему выбор способа доставки и оплаты.`);

    const text =
`Отлично! Как вам удобнее оплатить и получить заказ?
Обратите внимание, если в заказе есть CBD продукция, то выберите, пожалуйста, оплату переводом.`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: "СДЭК + QR", callback_data: `order_method:cdek_qr:${orderId}` },
          { text: "Почта + QR", callback_data: `order_method:pochta_qr:${orderId}` }
        ],
        [
          { text: "СДЭК + перевод", callback_data: `order_method:cdek_transfer:${orderId}` },
          { text: "Почта + перевод", callback_data: `order_method:pochta_transfer:${orderId}` }
        ],
        [
          { text: "Самовывоз Ярославль", callback_data: `order_method:pickup_yar:${orderId}` }
        ],
        [
          { text: "Доставка по Ярославлю", callback_data: `order_method:delivery_yar:${orderId}` }
        ]
      ]
    };

    const sendResult = await notifyCustomer(order, text, keyboard);

    if (sendResult.ok) {
      await saveReplyMapping(sendResult.result.message_id, order.telegramUserId);
    }

    return;

  }

  // ---- Клиент выбрал способ доставки/оплаты ----
  if (action === "order_method") {

    const methodCode = parts[1];
    const orderId = parts[2];

    const order = await getOrder(orderId);

    if (!order) {
      await ack("Заказ не найден");
      return;
    }

    const [deliveryPart, paymentPart] = methodCode.split("_");

    const deliveryMethod =
      methodCode === "pickup_yar" ? "pickup_yar"
      : methodCode === "delivery_yar" ? "delivery_yar"
      : deliveryPart; // "cdek" | "pochta"

    const paymentMethod =
      methodCode === "pickup_yar" || methodCode === "delivery_yar"
      ? null
      : paymentPart; // "qr" | "transfer"

    await updateOrder(orderId, { deliveryMethod, paymentMethod });

    await ack(METHOD_LABELS[methodCode] || "Принято");
    await clearButtons(fromChatId, messageId);

    const orderLabel = order.storelandOrderNum || order.id;

    // Самовывоз/доставка по Ярославлю — дальше вручную через Reply
    if (methodCode === "pickup_yar" || methodCode === "delivery_yar") {

      await notifyCustomer(order, "Секунду, уже пишем вам 🙂");

      const adminResult = await notifyAdmin(
        `📍 Клиент по заказу №${orderLabel} выбрал: ${METHOD_LABELS[methodCode]}.\nОтветьте на это сообщение (Reply), чтобы написать клиенту напрямую.`
      );

      if (adminResult.ok && order.telegramUserId) {
        await saveReplyMapping(adminResult.result.message_id, order.telegramUserId);
      }

      return;

    }

    // СДЭК/Почта — просим данные получателя одним сообщением
    const dataRequestText =
      deliveryMethod === "cdek"
      ?
`Данные для отправки СДЭК (пишите, пожалуйста, в одном сообщении):
— ФИО получателя.
— Телефон получателя.
— Город и адрес пункта выдачи или постамата СДЭК.

Если нужна доставка до двери: полное ФИО и телефон получателя, полный адрес получателя.`
      :
`Данные для отправки Почтой (пишите, пожалуйста, в одном сообщении):
— ФИО получателя.
— Телефон получателя.
— Индекс почтового отделения (полный адрес не обязателен).

Если нужна доставка до двери: полное ФИО и телефон получателя, полный адрес получателя.`;

    await notifyCustomer(order, dataRequestText);

    if (order.telegramUserId) {
      await saveAwaitingShippingData(order.telegramUserId, orderId);
    }

    return;

  }

  // ---- Админ подтвердил, что данные получены и полные — считаем доставку ----
  if (action === "order_calc") {

    const orderId = parts[1];

    if (clickerId !== adminId) {
      await ack("Недоступно");
      return;
    }

    const order = await getOrder(orderId);

    if (!order) {
      await ack("Заказ не найден");
      return;
    }

    await ack("Отправлено клиенту");
    await clearButtons(fromChatId, messageId);

    const text =
`Посчитаем стоимость, срок доставки и пришлём данные на оплату заказа.
‼️ Обратите внимание:
— стоимость доставки СДЭК оплачивается при получении.
— стоимость доставки Почтой оплачивается вместе с суммой заказа.

Пожалуйста, ожидайте.`;

    await notifyCustomer(order, text);

    return;

  }

  // ---- Оплачен (уже было) ----
  if (action === "order_paid") {

    const orderId = parts[1];

    if (clickerId !== adminId) {
      await ack("Недоступно");
      return;
    }

    const order = await updateOrderStatus(orderId, "paid");

    if (!order) {
      await ack("Заказ не найден");
      return;
    }

    await ack(`Статус обновлён: ${STATUS_LABELS.paid.label}`);

    // Кнопка "Отправлен" должна остаться доступна — убираем только
    // саму кнопку "Оплачен"
    await telegramApi("editMessageReplyMarkup", {
      chat_id: fromChatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📦 Отправлен", callback_data: `order_shipped:${orderId}` }
          ]
        ]
      }
    });

    await notifyCustomer(
      order,
      `✅ Ваш заказ успешно оплачен!

Отправим в течение 3 дней, но обычно отправляем в день оплаты. Как только упакуем и отправим, пришлём трек-номер для отслеживания.

Историю всех заказов вы всегда можете посмотреть в разделе «Профиль» в мини-приложении магазина.`
    );

    return;

  }

  // ---- Отправлен — запрашиваем трек-номер (было в index.js, перенесено сюда) ----
  if (action === "order_shipped") {

    const orderId = parts[1];

    if (clickerId !== adminId) {
      await ack("Недоступно");
      return;
    }

    await ack();

    const askResult = await notifyAdmin(
      `📦 Введите трек-номер отправления для заказа #${orderId} (ответьте на это сообщение):`,
      { force_reply: true }
    );

    if (askResult.ok) {
      await saveTrackingRequest(askResult.result.message_id, orderId);
    }

    return;

  }

  // Неизвестное действие
  await ack();

}

// ==============================
// Обычные сообщения (не callback) — трек-номер и данные доставки
// ==============================

// Админ ответил трек-номером на запрос — возвращает true, если обработано
async function tryHandleTrackingReply(message) {

  if (!message.reply_to_message || !message.text) return false;

  const orderId = await getTrackingRequest(message.reply_to_message.message_id);

  if (!orderId) return false;

  const trackingNumber = message.text.trim();
  const order = await updateOrderStatus(orderId, "shipped", { trackingNumber });

  if (order) {

    await notifyAdmin(`✅ Заказ #${orderId} отмечен как отправленный. Трек-номер: ${trackingNumber}`);

    await notifyCustomer(
      order,
      `📦 Ваш заказ отправлен!\n\nТрек-номер: ${trackingNumber}`
    );

  } else {

    await notifyAdmin(`⚠️ Не удалось найти заказ #${orderId}, статус не обновлён.`);

  }

  return true;

}

// Клиент прислал данные получателя (СДЭК/Почта) — возвращает true, если обработано
async function tryHandleShippingData(message) {

  const chatId = String(message.chat.id);

  if (!message.text) return false;

  const orderId = await getAwaitingShippingData(chatId);

  if (!orderId) return false;

  const order = await getOrder(orderId);

  if (!order) return false;

  const shippingData = message.text.trim();

  await updateOrder(orderId, { shippingData });
  await clearAwaitingShippingData(chatId);

  const orderLabel = order.storelandOrderNum || order.id;

  const methodLabel =
    order.deliveryMethod === "cdek" ? "СДЭК" : "Почта";

  const adminResult = await notifyAdmin(
    `📥 Данные получателя по заказу №${orderLabel} (${methodLabel}):\n\n${shippingData}`,
    { inline_keyboard: [[{ text: "📐 Посчитать доставку", callback_data: `order_calc:${orderId}` }]] }
  );

  if (adminResult.ok && order.telegramUserId) {
    await saveReplyMapping(adminResult.result.message_id, order.telegramUserId);
  }

  return true;

}

module.exports = {
  handleOrderCallback,
  tryHandleTrackingReply,
  tryHandleShippingData
};
