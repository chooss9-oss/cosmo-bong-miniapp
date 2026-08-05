const { saveReplyMapping, telegramApi } = require("./replyMapping");

const {
  STATUS_LABELS,
  getOrder,
  updateOrder,
  updateOrderStatus,
  getRecentOrders,
  saveTrackingRequest,
  getTrackingRequest,
  saveAwaitingShippingData,
  getAwaitingShippingData,
  clearAwaitingShippingData
} = require("./orderStore");

const {
  computeCashback,
  addBonusPoints
} = require("./bonusStore");

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

// Имя/юзернейм клиента для уведомлений админу — чтобы было явно видно,
// кто именно нажал кнопку или прислал сообщение, а не обезличенное "Клиент"
function getCustomerLabel(order) {
  if (order.telegramUsername) return `@${order.telegramUsername}`;
  if (order.username) return `@${order.username} (введено вручную)`;
  return "клиент (без имени)";
}

// Строит клавиатуру действий для заказа по его текущему состоянию — общая
// логика для исходного уведомления, для повторной отправки карточки
// заказа (/orders) и для правки клавиатуры при каждом статусе. Кнопка
// "❌ Отменить" доступна только до оплаты — после оплаты отмена это уже
// не просто "не пришли к сделке", а возврат денег, руками через Reply.
function buildOrderActionButtons(order, orderId) {

  if (["cancelled", "shipped", "ready"].includes(order.status)) {
    return [];
  }

  const secondButton =
    order.deliveryMethod === "pickup_yar"
    ? { text: "✅ Собран", callback_data: `order_ready:${orderId}` }
    : { text: "📦 Отправлен", callback_data: `order_shipped:${orderId}` };

  if (order.status === "paid") {
    return [[secondButton]];
  }

  const rows = [];

  if (order.status === "accepted" && !order.confirmRequestedAt) {
    rows.push([{ text: "✅ Принять заказ", callback_data: `order_accept:${orderId}` }]);
  }

  rows.push([
    { text: "💰 Оплачен", callback_data: `order_paid:${orderId}` },
    secondButton
  ]);

  rows.push([{ text: "❌ Отменить", callback_data: `order_cancel:${orderId}` }]);

  return rows;

}

// Короткая карточка заказа для списка /orders — без лишних деталей,
// только то, что нужно, чтобы понять, что за заказ и что с ним делать
function buildOrderCardText(order) {

  const orderLabel = order.storelandOrderNum || order.id;
  const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.accepted;
  const ageHours = Math.floor((Date.now() - order.createdAt) / (60 * 60 * 1000));
  const itemsText = (order.items || []).map(i => `${i.name} ×${i.quantity}`).join(", ");

  return (
    `${statusInfo.emoji} Заказ №${orderLabel} — ${getCustomerLabel(order)}\n` +
    `${itemsText}\n` +
    `💰 ${Number(order.total).toLocaleString()} ₽ · ${statusInfo.label} · ${ageHours} ч назад`
  );

}

// Отдельное статичное сообщение-пометка "можно ответить (Reply)" —
// текст полностью фиксированный, без данных из заказа, поэтому
// Markdown-разметка здесь всегда безопасна (не сломается из-за
// спецсимволов в имени/комментарии клиента)
async function sendReplyHint(telegramUserId) {

  const result = await telegramApi("sendMessage", {
    chat_id: process.env.ADMIN_ID,
    text: "✍️ *Можно ответить (Reply)* на сообщение выше — ответ уйдёт клиенту.",
    parse_mode: "Markdown"
  });

  if (result.ok && telegramUserId) {
    await saveReplyMapping(result.result.message_id, telegramUserId);
  }

  return result;

}

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

async function notifyAdmin(text, extraReplyMarkup, parseMode) {

  const result = await telegramApi("sendMessage", {
    chat_id: process.env.ADMIN_ID,
    text,
    reply_markup: extraReplyMarkup,
    parse_mode: parseMode
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

  } else {

    // Дублируем админу текст любого автоматического сообщения, которое
    // бот отправляет клиенту — чтобы всегда было видно, что именно
    // клиент получил
    const orderLabel = order.storelandOrderNum || order.id;

    await notifyAdmin(
      `📨 Клиенту отправлено сообщение (заказ №${orderLabel}):\n\n${text}`
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

    // Запоминаем момент, когда попросили подтверждение — от него считаем
    // 24-часовой дедлайн на подтверждение заказа клиентом
    await updateOrder(orderId, { confirmRequestedAt: Date.now() });

    // Кнопки "Оплачен"/"Отправлен"/"Отменить" остаются доступны — убираем
    // только саму кнопку "Принять заказ"
    await telegramApi("editMessageReplyMarkup", {
      chat_id: fromChatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: buildOrderActionButtons(
          { ...order, confirmRequestedAt: Date.now() },
          orderId
        )
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
    await updateOrderStatus(orderId, "confirmed", { confirmedAt: Date.now() });

    const orderLabel = order.storelandOrderNum || order.id;

    await notifyAdmin(`✅ ${getCustomerLabel(order)} подтвердил заказ №${orderLabel}. Отправил ему выбор способа доставки и оплаты.`);

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

    // Единое уведомление о нажатой кнопке доставки/оплаты — это в первую
    // очередь интересующие админа кнопки, отдельно от текста сообщений
    // клиенту
    await notifyAdmin(
      `🚚 ${getCustomerLabel(order)} нажал кнопку доставки/оплаты по заказу №${orderLabel}: «${METHOD_LABELS[methodCode] || methodCode}»`
    );

    // Самовывоз в Ярославле — адрес и часы работы отправляем сразу
    // автоматически, плюс меняем кнопку "Отправлен" у админа на "Собран"
    if (methodCode === "pickup_yar") {

      await notifyCustomer(
        order,
        `Наш магазин работает с 13:00 до 18:30 со вторника по субботу по адресу Депутатский переулок 6, вход с левого торца здания.

Как только заказ будет собран, вам придёт соответствующее уведомление.`
      );

      const adminResult = await notifyAdmin(
        `✍️ *Можно ответить (Reply)* на это сообщение, чтобы написать клиенту заказа №${orderLabel} напрямую.`,
        undefined,
        "Markdown"
      );

      if (adminResult.ok && order.telegramUserId) {
        await saveReplyMapping(adminResult.result.message_id, order.telegramUserId);
      }

      // Меняем "Отправлен" на "Собран" в исходном уведомлении о заказе
      if (order.adminMessageId) {

        await telegramApi("editMessageReplyMarkup", {
          chat_id: process.env.ADMIN_ID,
          message_id: order.adminMessageId,
          reply_markup: {
            inline_keyboard: buildOrderActionButtons(
              { ...order, deliveryMethod, paymentMethod },
              orderId
            )
          }
        });

      }

      return;

    }

    // Доставка по Ярославлю — дальше вручную через Reply
    if (methodCode === "delivery_yar") {

      await notifyCustomer(order, "Секунду, уже пишем вам 🙂");

      const adminResult = await notifyAdmin(
        `✍️ *Можно ответить (Reply)* на это сообщение, чтобы написать клиенту заказа №${orderLabel} напрямую.`,
        undefined,
        "Markdown"
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

    // Кнопка "Отправлен"/"Собран" должна остаться доступна — убираем
    // "Оплачен" и "Отменить" (после оплаты отмена — это уже возврат
    // денег, руками через Reply, а не кнопка бота)
    await telegramApi("editMessageReplyMarkup", {
      chat_id: fromChatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: buildOrderActionButtons(order, orderId)
      }
    });

    // Начисляем кэшбэк баллами — 5% от суммы заказа, доступны для
    // списания (до 50% суммы) при следующей покупке
    const cashback = computeCashback(order.total);
    await addBonusPoints(order.telegramUserId, cashback);

    await notifyCustomer(
      order,
      `✅ Ваш заказ успешно оплачен!

Отправим в течение 3 дней, но обычно отправляем в день оплаты. Как только упакуем и отправим, пришлём трек-номер для отслеживания.

🎁 Вам начислено ${cashback} баллов кэшбэка (5% от заказа) — можно списать до 50% суммы следующего заказа. Баланс баллов смотрите в разделе «Профиль» в мини-приложении магазина.`
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

  // ---- Собран (самовывоз) — сообщаем клиенту, что можно забрать заказ ----
  if (action === "order_ready") {

    const orderId = parts[1];

    if (clickerId !== adminId) {
      await ack("Недоступно");
      return;
    }

    const order = await updateOrderStatus(orderId, "ready");

    if (!order) {
      await ack("Заказ не найден");
      return;
    }

    await ack(`Статус обновлён: ${STATUS_LABELS.ready.label}`);
    await clearButtons(fromChatId, messageId);

    await notifyCustomer(
      order,
      `✅ Ваш заказ собран и доступен к самовывозу.

Оплатить заказ можно в магазине наличными, картой, по QR-коду или переводом. Ждём вас!`
    );

    return;

  }

  // ---- Админ отменяет заказ вручную ----
  if (action === "order_cancel") {

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

    if (order.status === "cancelled") {
      await ack("Уже отменён");
      return;
    }

    await ack("Заказ отменён");
    await clearButtons(fromChatId, messageId);
    await cancelOrder(order, "manual");

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

    const orderLabel = order.storelandOrderNum || order.id;

    await notifyAdmin(`✅ Заказ №${orderLabel} отмечен как отправленный. Трек-номер: ${trackingNumber}`);

    await notifyCustomer(
      order,
      `📦 Ваш заказ №${orderLabel} отправлен!\n\nТрек-номер: ${trackingNumber}`
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

  // Текст содержит то, что напечатал клиент сам (ФИО, адрес и т.д.) —
  // Markdown сюда не добавляем, чтобы случайный спецсимвол не сломал
  // отправку сообщения
  const adminResult = await notifyAdmin(
    `📥 ${getCustomerLabel(order)} прислал данные получателя по заказу №${orderLabel} (${methodLabel}):\n\n${shippingData}`,
    { inline_keyboard: [[{ text: "📐 Посчитать доставку", callback_data: `order_calc:${orderId}` }]] }
  );

  if (adminResult.ok && order.telegramUserId) {
    await saveReplyMapping(adminResult.result.message_id, order.telegramUserId);
  }

  // Отдельная жирная пометка (Reply) — уже безопасный статичный текст
  await sendReplyHint(order.telegramUserId);

  return true;

}

// ==============================
// Автоматическая отмена заказов, которые клиент не подтвердил или не
// оплатил в течение суток, с мягкими напоминаниями до этого
// ==============================

const HOUR_MS = 60 * 60 * 1000;

const CONFIRM_DEADLINE_HOURS = 24;
const PAYMENT_DEADLINE_HOURS = 24;

// Два мягких напоминания в течение суток — на 8-м и 16-м часу ожидания
const REMINDER_HOURS = [8, 16];

// Методы доставки, где оплата/получение происходит не через бота
// (самовывоз — оплата в магазине, доставка по городу — вручную через
// Reply), поэтому дедлайн на "оплату" к ним не применяем
const NO_PAYMENT_DEADLINE_METHODS = ["pickup_yar", "delivery_yar"];

async function sendConfirmReminder(order, count) {

  const orderLabel = order.storelandOrderNum || order.id;

  await notifyCustomer(
    order,
    `👋 Напоминаем: заказ №${orderLabel} пока не подтверждён. Нажмите кнопку «✅ Заказ подтверждаю» в сообщении выше, чтобы мы начали сборку.

Если не подтвердить в течение 24 часов с момента принятия заказа — он будет автоматически отменён.`
  );

  await updateOrder(order.id, { confirmReminderCount: count });

}

async function sendPaymentReminder(order, count) {

  const orderLabel = order.storelandOrderNum || order.id;

  await notifyCustomer(
    order,
    `👋 Напоминаем: заказ №${orderLabel} пока не оплачен.

Пожалуйста, оплатите в течение 24 часов с момента подтверждения заказа — иначе он будет автоматически отменён.`
  );

  await updateOrder(order.id, { paymentReminderCount: count });

}

async function cancelOrder(order, reason) {

  const orderLabel = order.storelandOrderNum || order.id;

  await updateOrderStatus(order.id, "cancelled", {
    cancelledAt: Date.now(),
    cancelReason: reason
  });

  // Если при заказе списывались баллы кэшбэка — возвращаем их обратно,
  // раз заказ так и не состоялся
  if (order.pointsUsed > 0 && order.telegramUserId) {
    await addBonusPoints(order.telegramUserId, order.pointsUsed);
  }

  const reasonText =
    reason === "confirm" ? "мы не получили от вас подтверждение в течение суток"
    : reason === "payment" ? "не поступила оплата в течение суток"
    : "решили отменить его";

  await notifyCustomer(
    order,
    `😌 Заказ №${orderLabel} аннулирован — ${reasonText}.

Это не страшно! Вы всегда можете оформить новый заказ в приложении магазина в любое удобное время 🌿`
  );

  const adminReasonText =
    reason === "confirm" ? "нет подтверждения более 24 часов"
    : reason === "payment" ? "нет оплаты более 24 часов"
    : "отменён вручную";

  await notifyAdmin(`❌ Заказ №${orderLabel} аннулирован (${adminReasonText}).`);

}

// Вызывается по расписанию (см. /api/check-order-timeouts) — проходит по
// последним заказам и рассылает напоминания/отмены там, где нужно
async function checkOrderTimeouts() {

  const orders = await getRecentOrders();
  const now = Date.now();

  for (const order of orders) {

    try {

      // ---- Ждём подтверждения от клиента (кнопка "Заказ подтверждаю") ----
      if (order.status === "accepted" && order.confirmRequestedAt) {

        const hoursElapsed = (now - order.confirmRequestedAt) / HOUR_MS;

        if (hoursElapsed >= CONFIRM_DEADLINE_HOURS) {

          await cancelOrder(order, "confirm");

        } else {

          const remindersSent = order.confirmReminderCount || 0;

          if (hoursElapsed >= REMINDER_HOURS[1] && remindersSent < 2) {
            await sendConfirmReminder(order, 2);
          } else if (hoursElapsed >= REMINDER_HOURS[0] && remindersSent < 1) {
            await sendConfirmReminder(order, 1);
          }

        }

      }

      // ---- Ждём оплаты (только для доставки Почтой/СДЭК) ----
      if (
        order.status === "confirmed" &&
        order.confirmedAt &&
        !NO_PAYMENT_DEADLINE_METHODS.includes(order.deliveryMethod)
      ) {

        const hoursElapsed = (now - order.confirmedAt) / HOUR_MS;

        if (hoursElapsed >= PAYMENT_DEADLINE_HOURS) {

          await cancelOrder(order, "payment");

        } else {

          const remindersSent = order.paymentReminderCount || 0;

          if (hoursElapsed >= REMINDER_HOURS[1] && remindersSent < 2) {
            await sendPaymentReminder(order, 2);
          } else if (hoursElapsed >= REMINDER_HOURS[0] && remindersSent < 1) {
            await sendPaymentReminder(order, 1);
          }

        }

      }

    } catch (error) {
      console.error(`❌ Ошибка проверки таймаута заказа №${order.id}:`, error.message);
    }

  }

}

module.exports = {
  handleOrderCallback,
  tryHandleTrackingReply,
  tryHandleShippingData,
  checkOrderTimeouts,
  notifyCustomer,
  notifyAdmin,
  buildOrderActionButtons,
  buildOrderCardText
};
