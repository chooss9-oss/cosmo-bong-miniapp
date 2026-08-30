const { saveReplyMapping, telegramApi } = require("./replyMapping");

const {
  STATUS_LABELS,
  getOrder,
  updateOrder,
  updateOrderStatus,
  getRecentOrders,
  saveTrackingRequest,
  getTrackingRequest,
  savePaymentDetailsRequest,
  getPaymentDetailsRequest,
  getPaymentRequisites,
  savePendingBank,
  getPendingBank,
  saveOrderEditRequest,
  getOrderEditRequest,
  saveAwaitingShippingData,
  getAwaitingShippingData,
  clearAwaitingShippingData
} = require("./orderStore");

const {
  computeCashback,
  addBonusPoints
} = require("./bonusStore");

const { appendChatMessage, addPendingReaction } = require("./chatStore");
const { getPushToken, sendExpoPush, sendWebPush } = require("./pushStore");

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

// "1 день" / "2 дня" / "5 дней"
function pluralizeDays(n) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

const BANK_LABELS = {
  sber: "Сбер",
  raif: "Райф"
};

// QR СБП показываем только для Сбера — картинка лежит в public/ фронтенда,
// раздаётся по прямой ссылке на проде
const QR_SBP_URL = "https://cosmo-bong-miniapp.vercel.app/qr-sbp.jpg";

// Собирает текст счёта под конкретную пару способ доставки × банк.
// Для Почты доставка платится вместе с заказом, поэтому в тексте одна
// общая сумма и нет отдельной строки "Сумма доставки". Для СДЭК —
// наоборот, доставка отдельно и оплачивается при получении.
async function buildInvoiceText(order, bank, deliveryCost, deliveryDays) {

  const requisites = await getPaymentRequisites(bank);
  const daysText = `${deliveryDays} ${pluralizeDays(deliveryDays)}`;
  const qrNote = bank === "sber" ? " или по QR коду" : "";

  const footer =
`Оплатите свой заказ в течение 24 часов. После оплаты пришлите нам чек/скрин или просто сообщите, что оплатили. Отправим в течение 3-х дней после оплаты. Трек-номер для отслеживания предоставим.`;

  if (order.deliveryMethod === "pochta") {

    const combinedTotal = Number(order.total) + Number(deliveryCost);

    return (
      `— Сумма заказа с учетом стоимости доставки (оплата по реквизитам ниже${qrNote}): ${combinedTotal.toLocaleString()}₽\n\n` +
      `— Срок доставки (без учёта выходных): ${daysText}\n\n` +
      `${requisites}\n\n` +
      footer
    );

  }

  // СДЭК (и вообще всё, что не "Почта")
  return (
    `— Сумма заказа (оплата по реквизитам ниже${qrNote}): ${Number(order.total).toLocaleString()}₽\n\n` +
    `— Сумма доставки (оплачивается при получении): ${Number(deliveryCost).toLocaleString()}₽\n\n` +
    `— Срок доставки (без учёта выходных): ${daysText}\n\n` +
    `${requisites}\n\n` +
    footer
  );

}

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

  rows.push([
    { text: "✏️ Изменить заказ", callback_data: `order_edit:${orderId}` },
    { text: "❌ Отменить", callback_data: `order_cancel:${orderId}` }
  ]);

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

// Реакция 👍 на сообщение-копию у админа — визуальное подтверждение, что
// клиенту реально доставлено (не просто "отправлено в фоне без ошибок").
// "✅" тут не работает — Telegram разрешает реакции только из своего
// фиксированного набора эмодзи, "👍" в него входит.
async function markDelivered(chatId, messageId) {

  const result = await telegramApi("setMessageReaction", {
    chat_id: chatId,
    message_id: messageId,
    reaction: [{ type: "emoji", emoji: "👍" }]
  }).catch(err => ({ ok: false, description: err.message }));

  if (!result.ok) {
    console.log("orderFlow: markDelivered (setMessageReaction) FAILED:", JSON.stringify(result));
  }

}

async function notifyCustomer(order, text, replyMarkup) {

  if (!order.telegramUserId) return { ok: false };

  // Заказы из Android-приложения не имеют настоящего Telegram-чата с ботом
  // (telegramUserId у них — псевдо-ID вида "android:<телефон>", не годится
  // как chat_id для Bot API) — доставляем такие уведомления через чат
  // приложения + push вместо telegramApi sendMessage. Кнопки (replyMarkup)
  // в простом текстовом чате не поддерживаются, поэтому для Android они
  // игнорируются.
  if (order.platform === "android") {

    // inline_keyboard из Telegram-формата кнопок переносим как есть — в
    // приложении рендерится тот же набор строк/кнопок с тем же
    // callback_data, нажатие уходит на POST /api/chat/button (см.
    // routes/chat.js), который вызывает те же confirmOrderByCustomer/
    // selectDeliveryMethodByCustomer, что и Telegram callback_query.
    // Чат приложения умеет только кнопки-действия (callback_data) — кнопки
    // со ссылкой (url), которые есть в некоторых Telegram-клавиатурах,
    // просто отфильтровываем, чтобы не показывать в приложении нерабочую
    // кнопку.
    const buttons = replyMarkup?.inline_keyboard
      ?.map(row => row.filter(btn => btn.callback_data))
      .filter(row => row.length > 0);

                  await appendChatMessage(order.telegramUserId, { from: "admin", text, buttons });

    const pushToken = await getPushToken(order.telegramUserId);
    const pushResult = await sendExpoPush(pushToken, {
      title: "Cosmo Bong",
      body: text,
      data: { type: "chat" }
    });

    // iPhone/десктоп (Web Push через Firebase) — отдельный токен, эта
    // ветка раньше не учитывалась в автосообщениях сценария заказа,
    // из-за чего обычные ручные ответы на iPhone доходили, а автоматика
    // (принять/оплатить/доставка) — нет.
    const webPushToken = await getPushToken(order.telegramUserId, "web");
    if (webPushToken) {
      await sendWebPush(webPushToken, { title: "Cosmo Bong", body: text });
    }

    // Дублируем админу текст автосообщения — так же, как в Telegram-ветке
    // ниже — чтобы было видно, что именно клиенту ушло, даже если это
    // не ручной ответ, а автоматика сценария заказа (подтверждение,
    // выбор доставки и т.п.)
    const orderLabelAndroid = order.storelandOrderNum || order.id;
    const mirrorTextAndroid =
      `👤 Клиент: ${getCustomerLabel(order)}\n` +
      `📨 Клиенту отправлено автосообщение (заказ №${orderLabelAndroid}):\n\n${text}`;

    // Тот же заголовок — в историю чата панели как internal-сообщение
    // (клиент его не увидит, см. фильтр в GET /api/chat/history), чтобы
    // перед автосообщением было видно контекст, как и в Telegram.
    await appendChatMessage(order.telegramUserId, { from: "admin", text: mirrorTextAndroid, internal: true });

    const mirrorResultAndroid = await notifyAdmin(mirrorTextAndroid);

    if (mirrorResultAndroid.ok) {
      // Ставим в очередь на реакцию 👍, как и обычные ответы — она
      // проставится, когда клиент реально откроет чат в приложении
      // (см. POST /api/chat/mark-read)
      await addPendingReaction(order.telegramUserId, mirrorResultAndroid.result.message_id);
    }

        // Push в веб-панель оператора — те же автосообщения сценария заказа
    // (подтверждение, выбор доставки, счёт и т.д.) должны быть видны
    // оператору так же, как обычные сообщения от/для клиента.
    await fetch("https://cosmo-bong-telegram-relay.chooss9.workers.dev/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "push",
        text: `Посетитель: ${order.telegramUserId}\n📨 Заказ №${orderLabelAndroid} — клиенту отправлено: ${text.slice(0, 200)}`
      })
    }).catch((e) => console.error("❌ PUSH RELAY ERROR (order flow):", e.message));

    return pushResult;

  }

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
    // клиент получил. Сверху — id клиента, снизу на самой копии —
    // реакция 👍, подтверждающая, что сообщение реально доставлено.
    const orderLabel = order.storelandOrderNum || order.id;

    const mirrorResult = await notifyAdmin(
      `👤 Клиент: ${getCustomerLabel(order)}\n` +
      `📨 Клиенту отправлено сообщение (заказ №${orderLabel}):\n\n${text}`
    );

    if (mirrorResult.ok) {
      await markDelivered(process.env.ADMIN_ID, mirrorResult.result.message_id);
    }

  }

  return result;

}

// Отправляет клиенту фото (QR-код для оплаты) с копией админу — как и
// notifyCustomer для текста, только для фото
async function notifyCustomerPhoto(order, photoUrl, caption) {

  if (!order.telegramUserId) return { ok: false };

  if (order.platform === "android") {

             await appendChatMessage(order.telegramUserId, {
      from: "admin",
      text: caption || "",
      imageUrl: photoUrl
    });

    const pushToken = await getPushToken(order.telegramUserId);
    const pushResult = await sendExpoPush(pushToken, {
      title: "Cosmo Bong",
      body: caption || "Новое сообщение",
      data: { type: "chat" }
    });

    const webPushTokenPhoto = await getPushToken(order.telegramUserId, "web");
    if (webPushTokenPhoto) {
      await sendWebPush(webPushTokenPhoto, { title: "Cosmo Bong", body: caption || "Новое сообщение" });
    }

      const orderLabelAndroidPhoto = order.storelandOrderNum || order.id;

    const mirrorResultAndroidPhoto = await telegramApi("sendPhoto", {
      chat_id: process.env.ADMIN_ID,
      photo: photoUrl,
      caption: `👤 Клиент: ${getCustomerLabel(order)}\n📨 Клиенту отправлен QR-код для оплаты (заказ №${orderLabelAndroidPhoto})`
    }).catch(() => ({ ok: false }));

    if (mirrorResultAndroidPhoto.ok) {
      await addPendingReaction(order.telegramUserId, mirrorResultAndroidPhoto.result.message_id);
    }

        await fetch("https://cosmo-bong-telegram-relay.chooss9.workers.dev/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "push",
        text: `Посетитель: ${order.telegramUserId}\n📨 Заказ №${orderLabelAndroidPhoto} — клиенту отправлен QR-код для оплаты`
      })
    }).catch((e) => console.error("❌ PUSH RELAY ERROR (order flow photo):", e.message));

    return pushResult;

  }

  const result = await telegramApi("sendPhoto", {
    chat_id: order.telegramUserId,
    photo: photoUrl,
    caption
  });

  if (!result.ok) {

    console.log("orderFlow: notifyCustomerPhoto FAILED:", JSON.stringify(result));

    await notifyAdmin(
      `⚠️ Не удалось отправить QR-код клиенту по заказу #${order.id}.`
    );

  } else {

    const orderLabel = order.storelandOrderNum || order.id;

    const mirrorResult = await telegramApi("sendPhoto", {
      chat_id: process.env.ADMIN_ID,
      photo: photoUrl,
      caption: `👤 Клиент: ${getCustomerLabel(order)}\n📨 Клиенту отправлен QR-код для оплаты (заказ №${orderLabel})`
    }).catch(() => ({ ok: false }));

    if (mirrorResult.ok) {
      await markDelivered(process.env.ADMIN_ID, mirrorResult.result.message_id);
    }

  }

  return result;

}

// ==============================
// Действия КЛИЕНТА в сценарии заказа (подтверждение, выбор доставки,
// данные получателя) — вынесены в отдельные функции, потому что клиент
// может прислать их двумя разными способами: нажатием инлайн-кнопки в
// Telegram (callback_query, см. handleOrderCallback ниже) или нажатием
// такой же кнопки в чате Android-приложения (POST /api/chat/button, см.
// server/routes/chat.js). Логика заказа при этом одна и та же — отличается
// только то, что Telegram-обработчик дополнительно "гасит" кнопки в самом
// сообщении бота (clearButtons), а Android их просто теряет актуальность
// (сервер отклонит повторное нажатие, см. проверки статуса ниже).
// ==============================

async function confirmOrderByCustomer(orderId) {

  const order = await getOrder(orderId);

  if (!order) return { ok: false, reason: "not_found" };

  // Заказ подтверждают один раз, пока он в статусе "принят" — если уже
  // подтверждён (или клиент нажал кнопку повторно), просто ничего не делаем
  if (order.status !== "accepted") return { ok: false, reason: "already_processed" };

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

  if (sendResult.ok && sendResult.result) {
    await saveReplyMapping(sendResult.result.message_id, order.telegramUserId);
  }

  return { ok: true };

}

async function selectDeliveryMethodByCustomer(methodCode, orderId) {

  const order = await getOrder(orderId);

  if (!order) return { ok: false, reason: "not_found" };

  // Способ доставки выбирают один раз — повторное нажатие (например,
  // двойной тап в приложении) игнорируем
  if (order.deliveryMethod) return { ok: false, reason: "already_processed" };

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

    return { ok: true };

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

    return { ok: true };

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

  return { ok: true };

}

// Клиент прислал данные получателя (СДЭК/Почта) текстом — общая логика для
// Telegram (message.text в личке с ботом) и для чата Android-приложения
// (POST /api/chat/send, см. routes/chat.js). Возвращает true, если текст
// был распознан как данные получателя (т.е. клиент как раз ждал этого шага).
async function submitShippingDataText(customerId, text) {

  const orderId = await getAwaitingShippingData(customerId);

  if (!orderId) return false;

  const order = await getOrder(orderId);

  if (!order) return false;

  const shippingData = String(text).trim();

  await updateOrder(orderId, { shippingData });
  await clearAwaitingShippingData(customerId);

  const orderLabel = order.storelandOrderNum || order.id;

  const methodLabel =
    order.deliveryMethod === "cdek" ? "СДЭК" : "Почта";

  // Текст содержит то, что напечатал клиент сам (ФИО, адрес и т.д.) —
  // Markdown сюда не добавляем, чтобы случайный спецсимвол не сломал
  // отправку сообщения
    const calcButton = { inline_keyboard: [[{ text: "📐 Посчитать доставку", callback_data: `order_calc:${orderId}` }]] };

  const adminResult = await notifyAdmin(
    `📥 ${getCustomerLabel(order)} прислал данные получателя по заказу №${orderLabel} (${methodLabel}):\n\n${shippingData}`,
    calcButton
  );

  if (adminResult.ok && order.telegramUserId) {
    await saveReplyMapping(adminResult.result.message_id, order.telegramUserId);
  }

  if (order.platform === "android") {
    await appendChatMessage(order.telegramUserId, {
      from: "admin",
      text: `📥 Данные получателя по заказу №${orderLabel} (${methodLabel}):\n\n${shippingData}`,
      buttons: calcButton.inline_keyboard,
      internal: true
    });
  }

  // Отдельная жирная пометка (Reply) — уже безопасный статичный текст.
  // Работает одинаково для обеих платформ: Reply у админа на это
  // сообщение уйдёт клиенту либо в Telegram, либо (для Android) в чат
  // приложения push-уведомлением — маршрутизация уже настроена в
  // saveReplyMapping/routes/chat.js.
  await sendReplyHint(order.telegramUserId);

  return true;

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

    const contactHint =
      order.platform === "android"
        ? "Если есть вопросы — пиши прямо в этом чате, разберёмся и быстро поможем✨"
        : "Если есть вопросы — пиши прямо в боте, разберёмся и быстро поможем✨";

    const welcomeText =
`👋 Приветствую! Заказ №${orderLabel} получили и готовы собирать.

📦 Отправляем по 100% предоплате, доставляем Почтой или СДЭК (от 350₽, от 2 дней), оплата переводом на карту или по QR.

После отправления заказа пришлём трек-номер для отслеживания.
${contactHint}

❗️ Подтвердите заказ в течение 24 часов. Если мы не дождёмся подтверждения, то заказ отменим.`;

    const sendResult = await notifyCustomer(order, welcomeText, {
      inline_keyboard: [[{ text: "✅ Заказ подтверждаю", callback_data: `order_confirm:${orderId}` }]]
    });

    if (sendResult.ok && sendResult.result) {
      await saveReplyMapping(sendResult.result.message_id, order.telegramUserId);
    }

    return;

  }

  // ---- Клиент подтверждает заказ — сразу отправляем выбор доставки/оплаты ----
  // (наличие уже проверено админом на шаге "Принять заказ", поэтому
  // дополнительного шага подтверждения от админа здесь не нужно)
  if (action === "order_confirm") {

    const orderId = parts[1];
    const result = await confirmOrderByCustomer(orderId);

    if (!result.ok) {
      await ack(result.reason === "not_found" ? "Заказ не найден" : "Уже обработано");
      return;
    }

    await ack("Спасибо за подтверждение!");
    await clearButtons(fromChatId, messageId);

    return;

  }

  // ---- Клиент выбрал способ доставки/оплаты ----
  if (action === "order_method") {

    const methodCode = parts[1];
    const orderId = parts[2];

    const result = await selectDeliveryMethodByCustomer(methodCode, orderId);

    if (!result.ok) {
      await ack(result.reason === "not_found" ? "Заказ не найден" : "Уже обработано");
      return;
    }

    await ack(METHOD_LABELS[methodCode] || "Принято");
    await clearButtons(fromChatId, messageId);

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

    // Сначала спрашиваем у админа, каким банком выставлять счёт — от
    // этого зависит, какие реквизиты подставить и слать ли QR-код.
    // Числа (стоимость и срок доставки) спросим следующим шагом, уже
    // после выбора банка (см. order_bank ниже).
    const orderLabel = order.storelandOrderNum || order.id;

    await notifyAdmin(
      `💳 Выберите банк для счёта по заказу №${orderLabel}:`,
      {
        inline_keyboard: [[
          { text: "💳 Сбер", callback_data: `order_bank:sber:${orderId}` },
          { text: "💳 Райф", callback_data: `order_bank:raif:${orderId}` }
        ]]
      }
    );

    return;

  }

  // ---- Админ выбрал банк для счёта — теперь спрашиваем два числа ----
  if (action === "order_bank") {

    const bank = parts[1];
    const orderId = parts[2];

    if (clickerId !== adminId) {
      await ack("Недоступно");
      return;
    }

    const order = await getOrder(orderId);

    if (!order) {
      await ack("Заказ не найден");
      return;
    }

    await ack(bank === "sber" ? "Сбер выбран" : "Райф выбран");
    await clearButtons(fromChatId, messageId);

    await savePendingBank(orderId, bank);

    const orderLabel = order.storelandOrderNum || order.id;

    // Именно с ответа на это сообщение (не с момента подтверждения
    // заказа) начинается отсчёт 24 часов на оплату
    const askResult = await notifyAdmin(
      `💳 (${BANK_LABELS[bank]}) Введите стоимость и срок доставки для заказа №${orderLabel} одним сообщением через запятую (ответьте на это сообщение).\nНапример: 450, 4`,
      { force_reply: true }
    );

    if (askResult.ok) {
      await savePaymentDetailsRequest(askResult.result.message_id, orderId);
    }

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

    // Начисляем кэшбэк баллами — ставка зависит от платформы заказа
    // (5% Telegram Mini App / 3% Android), доступны для списания
    // (до 50% суммы) при следующей покупке
    const cashback = computeCashback(order.total, order.platform);
    const cashbackPercent = order.platform === "android" ? 3 : 5;
    await addBonusPoints(order.telegramUserId, cashback);

    const balanceHint =
      order.platform === "android"
        ? "Баланс баллов смотрите в разделе «Профиль» в этом приложении."
        : "Баланс баллов смотрите в разделе «Профиль» в мини-приложении магазина.";

    await notifyCustomer(
      order,
      `✅ Ваш заказ успешно оплачен!

Отправим в течение 3 дней, но обычно отправляем в день оплаты. Как только упакуем и отправим, пришлём трек-номер для отслеживания.

🎁 Вам начислено ${cashback} баллов кэшбэка (${cashbackPercent}% от заказа) — можно списать до 50% суммы следующего заказа. ${balanceHint}`
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

  // ---- Админ правит состав/сумму заказа вручную (например, если что-то
  // поменяли прямо в админке Storeland — туда бот сам не заглядывает) ----
  if (action === "order_edit") {

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

    await ack("Введите новый заказ");

    const currentItemsText = (order.items || [])
      .map(i => `${i.name} x${i.quantity}`)
      .join("\n");

    const askResult = await notifyAdmin(
      `✏️ Введите новый состав и сумму заказа №${order.storelandOrderNum || order.id} одним сообщением (ответьте на это сообщение).\n\n` +
      `Формат — список товаров, последней строкой сумма:\n\n` +
      `Название товара x2\nДругой товар x1\nСумма: 3200\n\n` +
      `Текущий состав для справки:\n${currentItemsText || "—"}\nСумма: ${Number(order.total).toLocaleString()}`,
      { force_reply: true }
    );

    if (askResult.ok) {
      await saveOrderEditRequest(askResult.result.message_id, orderId);
    }

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

// Админ ответил стоимостью и сроком доставки на запрос из order_calc —
// возвращает true, если обработано. Собирает и отправляет клиенту полный
// счёт (сумма заказа уже известна, реквизиты берём из сохранённого
// шаблона), и с этого момента отсчитывает 24 часа на оплату.
async function tryHandlePaymentDetailsReply(message) {

  if (!message.reply_to_message || !message.text) return false;

  const orderId = await getPaymentDetailsRequest(message.reply_to_message.message_id);

  if (!orderId) return false;

  const order = await getOrder(orderId);

  if (!order) {
    await notifyAdmin(`⚠️ Не удалось найти заказ #${orderId}, счёт не отправлен.`);
    return true;
  }

  const [rawCost, rawDays] = message.text.split(",").map(part => part.trim());

  const deliveryCost = Number(rawCost);
  const deliveryDays = Number(rawDays);

  if (!rawCost || !rawDays || isNaN(deliveryCost) || isNaN(deliveryDays)) {

    await notifyAdmin(
      `⚠️ Не разобрал сообщение — нужно два числа через запятую (стоимость доставки, срок в днях), например: 450, 4.\nПопробуйте ещё раз, ответив (Reply) на исходный запрос.`
    );

    return true;

  }

  const orderLabel = order.storelandOrderNum || order.id;

  const bank = (await getPendingBank(orderId)) || "sber";

  const invoiceText = await buildInvoiceText(order, bank, deliveryCost, deliveryDays);

  await notifyCustomer(order, invoiceText);

  // QR-код по СБП шлём отдельным сообщением, только для Сбера
  if (bank === "sber") {
    await notifyCustomerPhoto(order, QR_SBP_URL, "Отсканируйте QR для оплаты по СБП");
  }

  await updateOrder(orderId, {
    deliveryCost,
    deliveryDays,
    paymentBank: bank,
    paymentRequestedAt: Date.now(),
    // Таймер перезапускается на счёте — сбрасываем счётчик напоминаний,
    // чтобы они снова отсчитывались от нового момента, а не от старого
    // (когда ждали именно подтверждения)
    paymentReminderCount: 0
  });

  await notifyAdmin(`✅ Счёт (${BANK_LABELS[bank]}) по заказу №${orderLabel} отправлен клиенту. Отсчёт 24 часов на оплату начался.`);

  return true;

}

// Админ ответил новым составом/суммой на запрос из order_edit — возвращает
// true, если обработано. Последняя строка вида "Сумма: 3200" — новая
// сумма заказа, всё, что выше неё, становится новым списком товаров
// (свободный текст, каждая строка — отдельная позиция).
async function tryHandleOrderEditReply(message) {

  if (!message.reply_to_message || !message.text) return false;

  const orderId = await getOrderEditRequest(message.reply_to_message.message_id);

  if (!orderId) return false;

  const order = await getOrder(orderId);

  if (!order) {
    await notifyAdmin(`⚠️ Не удалось найти заказ #${orderId}, изменения не применены.`);
    return true;
  }

  const lines = message.text.split("\n").map(line => line.trim()).filter(Boolean);

  const sumLineIndex = lines.findIndex(line => /^сумма\s*:?/i.test(line));

  if (sumLineIndex === -1) {

    await notifyAdmin(
      `⚠️ Не нашёл строку "Сумма: ..." — ничего не изменил.\nПопробуйте ещё раз, ответив (Reply) на исходный запрос. Последней строкой обязательно укажите сумму, например: Сумма: 3200`
    );

    return true;

  }

  const sumText = lines[sumLineIndex].replace(/^сумма\s*:?/i, "").trim();
  const newTotal = Number(sumText.replace(/[^\d.]/g, ""));

  if (isNaN(newTotal) || newTotal <= 0) {

    await notifyAdmin(
      `⚠️ Не разобрал сумму в строке "${lines[sumLineIndex]}" — ничего не изменил. Попробуйте ещё раз, ответив (Reply) на исходный запрос.`
    );

    return true;

  }

  const itemLines = lines.slice(0, sumLineIndex);

  const newItems = itemLines.length
    ? itemLines.map(line => {
        const match = line.match(/^(.*?)\s*[xх]\s*(\d+)\s*$/i);
        return match
          ? { name: match[1].trim(), quantity: Number(match[2]), price: null }
          : { name: line, quantity: 1, price: null };
      })
    : order.items;

  const orderLabel = order.storelandOrderNum || order.id;
  const oldTotal = order.total;

  await updateOrder(orderId, {
    items: newItems,
    total: newTotal
  });

  const newItemsText = newItems.map(i => `${i.name} ×${i.quantity}`).join("\n");

  await notifyAdmin(
    `✅ Заказ №${orderLabel} обновлён.\n\n${newItemsText}\n\nСумма: ${newTotal.toLocaleString()}₽ (было ${Number(oldTotal).toLocaleString()}₽)`
  );

  // Клиента предупреждаем — иначе сумма в счёте/кэшбэке разойдётся с тем,
  // что он ожидал, и это выглядит как ошибка
  await notifyCustomer(
    order,
    `ℹ️ В ваш заказ №${orderLabel} внесены изменения.\n\nАктуальный состав:\n${newItemsText}\n\nАктуальная сумма: ${newTotal.toLocaleString()}₽\n\nЕсли есть вопросы — просто напишите нам в этом чате.`
  );

  return true;

}

// Клиент прислал данные получателя (СДЭК/Почта) — возвращает true, если обработано
async function tryHandleShippingData(message) {

  const chatId = String(message.chat.id);

  if (!message.text) return false;

  return submitShippingDataText(chatId, message.text);

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
    : "вы либо не подтвердили, либо не оплатили его";

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

  // Подстраховка: если каталог не обновлялся дольше суток (например, cron
  // перестал срабатывать), предупреждаем админа явно, а не полагаемся,
  // что кто-то случайно заметит отсутствие новых товаров.
  try {
    const client = await require("./replyMapping").getRedisClient();
    const lastRun = await client.get("lastCatalogRunAt");
    const hoursSinceLastRun = lastRun ? (Date.now() - Number(lastRun)) / (60 * 60 * 1000) : null;

    if (hoursSinceLastRun === null || hoursSinceLastRun > 24) {
      await notifyAdmin(
        hoursSinceLastRun === null
          ? "⚠️ Каталог новых товаров ещё ни разу не обновлялся автоматически — проверьте cron /api/refresh-catalog."
          : `⚠️ Каталог новых товаров не обновлялся уже ${Math.round(hoursSinceLastRun)} ч. — проверьте cron /api/refresh-catalog.`
      );
    }
  } catch (error) {
    console.error("❌ Ошибка проверки давности обновления каталога:", error.message);
  }

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
      // Считаем не с момента подтверждения заказа, а с момента, когда
      // клиенту реально прислали счёт с реквизитами (paymentRequestedAt) —
      // до этого момента ему просто нечем платить. Если счёт почему-то
      // не выставлялся (paymentRequestedAt нет) — по-прежнему считаем от
      // confirmedAt, чтобы заказ не завис без дедлайна вообще
      const paymentDeadlineAnchor = order.paymentRequestedAt || order.confirmedAt;

      if (
        order.status === "confirmed" &&
        paymentDeadlineAnchor &&
        !NO_PAYMENT_DEADLINE_METHODS.includes(order.deliveryMethod)
      ) {

        const hoursElapsed = (now - paymentDeadlineAnchor) / HOUR_MS;

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

// ==============================
// Действия АДМИНА из веб-панели оператора — то же самое, что кнопки в
// Telegram (handleOrderCallback), но без проверки clickerId и без
// answerCallbackQuery. Кнопки в исходном сообщении Telegram обновляем
// той же логикой (editMessageReplyMarkup по order.adminMessageId), чтобы
// оба канала (Telegram и панель) оставались согласованы.
// ==============================

async function refreshAdminMessageButtons(order, orderId) {
  if (!order.adminMessageId) return;
  await telegramApi("editMessageReplyMarkup", {
    chat_id: process.env.ADMIN_ID,
    message_id: order.adminMessageId,
    reply_markup: { inline_keyboard: buildOrderActionButtons(order, orderId) }
  }).catch(() => {});
}

async function panelAcceptOrder(orderId) {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, reason: "not_found" };
  if (order.status !== "accepted" || order.confirmRequestedAt) {
    return { ok: false, reason: "already_processed" };
  }

  await updateOrder(orderId, { confirmRequestedAt: Date.now() });
  await refreshAdminMessageButtons({ ...order, confirmRequestedAt: Date.now() }, orderId);

  const orderLabel = order.storelandOrderNum || order.id;
  const contactHint =
    order.platform === "android"
      ? "Если есть вопросы — пиши прямо в этом чате, разберёмся и быстро поможем✨"
      : "Если есть вопросы — пиши прямо в боте, разберёмся и быстро поможем✨";

  const welcomeText =
`👋 Приветствую! Заказ №${orderLabel} получили и готовы собирать.

📦 Отправляем по 100% предоплате, доставляем Почтой или СДЭК (от 350₽, от 2 дней), оплата переводом на карту или по QR.

После отправления заказа пришлём трек-номер для отслеживания.
${contactHint}

❗️ Подтвердите заказ в течение 24 часов. Если мы не дождёмся подтверждения, то заказ отменим.`;

  const sendResult = await notifyCustomer(order, welcomeText, {
    inline_keyboard: [[{ text: "✅ Заказ подтверждаю", callback_data: `order_confirm:${orderId}` }]]
  });

  if (sendResult.ok && sendResult.result) {
    await saveReplyMapping(sendResult.result.message_id, order.telegramUserId);
  }

  return { ok: true };
}

async function panelMarkPaid(orderId) {
  const order = await updateOrderStatus(orderId, "paid");
  if (!order) return { ok: false, reason: "not_found" };

  await refreshAdminMessageButtons(order, orderId);

  const cashback = computeCashback(order.total, order.platform);
  const cashbackPercent = order.platform === "android" ? 3 : 5;
  await addBonusPoints(order.telegramUserId, cashback);

  const balanceHint =
    order.platform === "android"
      ? "Баланс баллов смотрите в разделе «Профиль» в этом приложении."
      : "Баланс баллов смотрите в разделе «Профиль» в мини-приложении магазина.";

  await notifyCustomer(
    order,
    `✅ Ваш заказ успешно оплачен!

Отправим в течение 3 дней, но обычно отправляем в день оплаты. Как только упакуем и отправим, пришлём трек-номер для отслеживания.

🎁 Вам начислено ${cashback} баллов кэшбэка (${cashbackPercent}% от заказа) — можно списать до 50% суммы следующего заказа. ${balanceHint}`
  );

  return { ok: true };
}

async function panelMarkShipped(orderId, trackingNumber) {
  if (!trackingNumber || !String(trackingNumber).trim()) {
    return { ok: false, reason: "empty_tracking" };
  }

  const order = await updateOrderStatus(orderId, "shipped", { trackingNumber: String(trackingNumber).trim() });
  if (!order) return { ok: false, reason: "not_found" };

  await refreshAdminMessageButtons(order, orderId);

  const orderLabel = order.storelandOrderNum || order.id;

  await notifyAdmin(`✅ Заказ №${orderLabel} отмечен как отправленный. Трек-номер: ${trackingNumber} (из панели)`);

  await notifyCustomer(
    order,
    `📦 Ваш заказ №${orderLabel} отправлен!\n\nТрек-номер: ${trackingNumber}`
  );

  return { ok: true };
}

async function panelMarkReady(orderId) {
  const order = await updateOrderStatus(orderId, "ready");
  if (!order) return { ok: false, reason: "not_found" };

  await refreshAdminMessageButtons(order, orderId);

  await notifyCustomer(
    order,
    `✅ Ваш заказ собран и доступен к самовывозу.

Оплатить заказ можно в магазине наличными, картой, по QR-коду или переводом. Ждём вас!`
  );

  return { ok: true };
}

async function panelEditOrder(orderId, editText) {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, reason: "not_found" };

  const lines = String(editText || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const sumLineIndex = lines.findIndex((line) => /^сумма\s*:?/i.test(line));

  if (sumLineIndex === -1) {
    return { ok: false, reason: "no_sum_line" };
  }

  const sumText = lines[sumLineIndex].replace(/^сумма\s*:?/i, "").trim();
  const newTotal = Number(sumText.replace(/[^\d.]/g, ""));

  if (isNaN(newTotal) || newTotal <= 0) {
    return { ok: false, reason: "bad_sum" };
  }

  const itemLines = lines.slice(0, sumLineIndex);
  const newItems = itemLines.length
    ? itemLines.map((line) => {
        const match = line.match(/^(.*?)\s*[xх]\s*(\d+)\s*$/i);
        return match
          ? { name: match[1].trim(), quantity: Number(match[2]), price: null }
          : { name: line, quantity: 1, price: null };
      })
    : order.items;

  const orderLabel = order.storelandOrderNum || order.id;
  const oldTotal = order.total;

  await updateOrder(orderId, { items: newItems, total: newTotal });

  const newItemsText = newItems.map((i) => `${i.name} ×${i.quantity}`).join("\n");

  await notifyAdmin(
    `✅ Заказ №${orderLabel} обновлён (из панели).\n\n${newItemsText}\n\nСумма: ${newTotal.toLocaleString()}₽ (было ${Number(oldTotal).toLocaleString()}₽)`
  );

  await notifyCustomer(
    order,
    `ℹ️ В ваш заказ №${orderLabel} внесены изменения.\n\nАктуальный состав:\n${newItemsText}\n\nАктуальная сумма: ${newTotal.toLocaleString()}₽\n\nЕсли есть вопросы — просто напишите нам в этом чате.`
  );

  return { ok: true };
}

async function panelCancelOrder(orderId) {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, reason: "not_found" };
  if (order.status === "cancelled") return { ok: false, reason: "already_cancelled" };

  await refreshAdminMessageButtons({ ...order, status: "cancelled" }, orderId);
  await cancelOrder(order, "manual");

  return { ok: true };
}

async function panelCalcOrder(orderId) {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, reason: "not_found" };

  const text =
`Посчитаем стоимость, срок доставки и пришлём данные на оплату заказа.
‼️ Обратите внимание:
— стоимость доставки СДЭК оплачивается при получении.
— стоимость доставки Почтой оплачивается вместе с суммой заказа.

Пожалуйста, ожидайте.`;

  await notifyCustomer(order, text);

  const orderLabel = order.storelandOrderNum || order.id;
  const bankButtons = {
    inline_keyboard: [[
      { text: "💳 Сбер", callback_data: `order_bank:sber:${orderId}` },
      { text: "💳 Райф", callback_data: `order_bank:raif:${orderId}` }
    ]]
  };

  await notifyAdmin(`💳 Выберите банк для счёта по заказу №${orderLabel}:`, bankButtons);

  if (order.platform === "android") {
    await appendChatMessage(order.telegramUserId, {
      from: "admin",
      text: `💳 Выберите банк для счёта по заказу №${orderLabel}:`,
      buttons: bankButtons.inline_keyboard,
      internal: true
    });
  }

  return { ok: true };
}

async function panelChooseBankAndInvoice(orderId, bank, priceDaysText) {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, reason: "not_found" };
  if (bank !== "sber" && bank !== "raif") return { ok: false, reason: "bad_bank" };

  const [rawCost, rawDays] = String(priceDaysText || "").split(",").map((p) => p.trim());
  const deliveryCost = Number(rawCost);
  const deliveryDays = Number(rawDays);

  if (!rawCost || !rawDays || isNaN(deliveryCost) || isNaN(deliveryDays)) {
    return { ok: false, reason: "bad_numbers" };
  }

  await savePendingBank(orderId, bank);

  const orderLabel = order.storelandOrderNum || order.id;
  const invoiceText = await buildInvoiceText(order, bank, deliveryCost, deliveryDays);

  await notifyCustomer(order, invoiceText);

  if (bank === "sber") {
    await notifyCustomerPhoto(order, QR_SBP_URL, "Отсканируйте QR для оплаты по СБП");
  }

  await updateOrder(orderId, {
    deliveryCost,
    deliveryDays,
    paymentBank: bank,
    paymentRequestedAt: Date.now(),
    paymentReminderCount: 0
  });

  await notifyAdmin(`✅ Счёт (${BANK_LABELS[bank]}) по заказу №${orderLabel} отправлен клиенту (из панели). Отсчёт 24 часов на оплату начался.`);

  return { ok: true };
}

module.exports = {
  handleOrderCallback,
  panelCalcOrder,
  panelChooseBankAndInvoice,
  panelAcceptOrder,
  panelMarkPaid,
  panelMarkShipped,
  panelMarkReady,
  panelEditOrder,
  panelCancelOrder,
  tryHandleTrackingReply,
  tryHandlePaymentDetailsReply,
  tryHandleOrderEditReply,
  tryHandleShippingData,
  checkOrderTimeouts,
  notifyCustomer,
  notifyCustomerPhoto,
  notifyAdmin,
  buildOrderActionButtons,
  buildOrderCardText,
  confirmOrderByCustomer,
  selectDeliveryMethodByCustomer,
  submitShippingDataText
};
