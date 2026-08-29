const { getRedisClient } = require("./replyMapping");
const { getOrdersForUser } = require("./orderStore");

// ==============================
// Чат с Android-клиентами. У Android-приложения нет своего Telegram-чата
// (customerId — это псевдо-ID вида "android:<телефон>", не настоящий
// telegram chat id), поэтому обычная пересылка сообщений клиенту через
// Telegram API для него не работает. Вместо этого переписка хранится здесь,
// в Redis, а клиенту сообщения админа доставляются push-уведомлением
// (см. server/pushStore.js) — приложение открывает этот же чат и подгружает
// историю через GET /api/chat/history.
//
// Админ по-прежнему работает целиком в Telegram-боте: Reply на уведомление
// о заказе/сообщение клиента — это и есть отправка сообщения в чат.
// ==============================

const MAX_MESSAGES = 200;

// Индекс активных Android-чатов для веб-панели оператора — обычного списка
// "все чаты" в Redis не было (только chat:<customerId> по отдельности).
// androidChatIndex — sorted set (score = время последнего сообщения) для
// сортировки по свежести; androidChatMeta — hash с превью последнего
// сообщения и флагом непрочитанного, чтобы не читать всю историю каждого
// чата ради списка.
const CHAT_INDEX_KEY = "androidChatIndex";
const CHAT_META_KEY = "androidChatMeta";

function isAndroidCustomerId(customerId) {
  return typeof customerId === "string" && customerId.startsWith("android:");
}

async function appendChatMessage(customerId, { from, text, buttons, imageUrl, audioUrl, internal }) {
  if (!customerId || (!text && !imageUrl && !audioUrl)) return null;

  const message = {
    from, // "admin" | "customer"
    text: text ? String(text) : "",
    createdAt: Date.now()
  };

  // Кнопки сценария заказа (подтвердить / выбор доставки) — тот же формат,
  // что inline_keyboard в Telegram: массив строк, в строке массив кнопок
  // { text, callback_data }. Одноразовые — после нажатия клиент получит
  // следующий шаг уже новым сообщением, старые кнопки просто перестают
  // быть актуальными (сервер игнорирует повторное нажатие по уже
  // обработанному orderId/шагу).
  if (buttons && buttons.length) {
    message.buttons = buttons;
  }

  // Фото (например QR-код для оплаты по СБП)
  if (imageUrl) {
    message.imageUrl = imageUrl;
  }

  // Голосовое сообщение (от клиента через /chat/send-voice или от админа
  // ответом голосом в Telegram-боте)
  if (audioUrl) {
    message.audioUrl = audioUrl;
  }

  // Служебные сообщения для админа (текст заказа, статусы сценария) —
  // видны в веб-панели оператора, но НЕ должны показываться самому
  // клиенту в приложении (см. фильтр в routes/chat.js GET /history).
  if (internal) {
    message.internal = true;
  }

  try {
    const client = await getRedisClient();
    const key = `chat:${customerId}`;
    await client.rPush(key, JSON.stringify(message));
    await client.lTrim(key, -MAX_MESSAGES, -1);
    // Храним 90 дней с момента последнего сообщения
    await client.expire(key, 60 * 60 * 24 * 90);

    await touchChatIndex(client, customerId, message);

    return message;
  } catch (error) {
    console.error("❌ Не удалось сохранить сообщение чата:", error.message);
    return null;
  }
}

async function getChatMessages(customerId) {
  if (!customerId) return [];

  try {
    const client = await getRedisClient();
    const raw = await client.lRange(`chat:${customerId}`, 0, -1);
    return raw.map((item) => {
      try {
        return JSON.parse(item);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (error) {
    console.error("❌ Не удалось прочитать сообщения чата:", error.message);
    return [];
  }
}

// ==============================
// "Прочитано" в Telegram-боте. Раньше реакция (👍/👎) ставилась сразу же,
// по факту того, дошёл ли push — но это не то же самое, что клиент реально
// увидел сообщение (push мог не дойти, а клиент при этом уже открыл чат и
// прочитал; или наоборот, push дошёл, но телефон лежал без дела). Поэтому
// вместо немедленной реакции копим ID сообщений админа в очередь на
// клиента, а реакцию ставим только когда клиент реально открывает чат в
// приложении (см. POST /api/chat/mark-read).
// ==============================

async function addPendingReaction(customerId, telegramMessageId) {
  if (!customerId || !telegramMessageId) return;

  try {
    const client = await getRedisClient();
    const key = `pendingReactions:${customerId}`;
    await client.rPush(key, String(telegramMessageId));
    await client.expire(key, 60 * 60 * 24 * 7); // неделя — с запасом
  } catch (error) {
    console.error("❌ Не удалось сохранить pending reaction:", error.message);
  }
}

// Забирает и сразу очищает список — вызывается один раз при подтверждении
// прочтения, дальше эти же ID реакцией уже не трогаем повторно.
async function popPendingReactions(customerId) {
  if (!customerId) return [];

  try {
    const client = await getRedisClient();
    const key = `pendingReactions:${customerId}`;
    const ids = await client.lRange(key, 0, -1);
    if (ids.length) {
      await client.del(key);
    }
    return ids;
  } catch (error) {
    console.error("❌ Не удалось прочитать pending reactions:", error.message);
    return [];
  }
}

// Обновляет индекс/превью для списка чатов в веб-панели оператора.
// Вызывается из appendChatMessage при каждом сообщении (и клиента, и
// админа) — customerId уже проверен на isAndroidCustomerId вызывающей
// стороной, здесь просто пишем в индекс.
async function touchChatIndex(client, customerId, message) {
  try {
    await client.zAdd(CHAT_INDEX_KEY, { score: message.createdAt, value: customerId });

    let preview = message.text || "";
    if (!preview && message.imageUrl) preview = "📷 Фото";
    if (!preview && message.audioUrl) preview = "🎤 Голосовое";

    const meta = {
      lastMessageAt: message.createdAt,
      lastMessageFrom: message.from,
      lastMessagePreview: preview.slice(0, 120),
      // Новое сообщение клиента — считаем непрочитанным, пока админ не
      // ответит (см. markCustomerMessagesRead) или явно не откроет чат
      // в панели.
      unread: message.from === "customer" ? true : false
    };

    await client.hSet(CHAT_META_KEY, customerId, JSON.stringify(meta));
  } catch (error) {
    console.error("❌ Не удалось обновить индекс Android-чатов:", error.message);
  }
}

// Список чатов для веб-панели оператора, отсортированный по свежести.
// Телефон отдельно не храним — он уже есть в самом customerId
// ("android:<телефон>"), см. комментарий в шапке файла. Дополнительно
// подтягиваем номер активного заказа этого клиента (если есть) — для
// отображения рядом с телефоном в списке чатов панели.
async function getAndroidChatList() {
  try {
    const client = await getRedisClient();
    const customerIds = await client.zRange(CHAT_INDEX_KEY, 0, -1, { REV: true });

    if (!customerIds.length) return [];

    const metaRaws = await client.hmGet(CHAT_META_KEY, customerIds);

    const ACTIVE_STATUSES_EXCLUDED = ["cancelled", "shipped", "ready"];

    const results = await Promise.all(customerIds.map(async (customerId, i) => {
      let meta = {};
      try {
        meta = metaRaws[i] ? JSON.parse(metaRaws[i]) : {};
      } catch {
        meta = {};
      }

      // Активный номер заказа этого клиента — самый свежий заказ, который
      // ещё не отменён/отправлен/готов.
      let activeOrderNum = null;
      try {
        const orders = await getOrdersForUser(customerId);
        const active = orders.find((o) => !ACTIVE_STATUSES_EXCLUDED.includes(o.status));
        if (active) activeOrderNum = active.storelandOrderNum || active.id;
      } catch {
        // не критично — просто не покажем номер заказа
      }

      return {
        customerId,
        phone: customerId.startsWith("android:") ? customerId.slice("android:".length) : customerId,
        lastMessageAt: meta.lastMessageAt || 0,
        lastMessageFrom: meta.lastMessageFrom || null,
        lastMessagePreview: meta.lastMessagePreview || "",
        unread: !!meta.unread,
        activeOrderNum
      };
    }));

    return results;
  } catch (error) {
    console.error("❌ Не удалось получить список Android-чатов:", error.message);
    return [];
  }
}

// Отметка "клиент прочитал чат" — постоянная (в отличие от pendingReactions,
// которая одноразовая и потребляется для реакции 👍 в Telegram). Нужна
// только для веб-панели оператора, чтобы показывать ✓✓ у своих сообщений
// (как clientReadAt у сайтового чата в Firestore).
async function markChatReadByCustomer(customerId) {
  if (!customerId) return;

  try {
    const client = await getRedisClient();
    const metaRaw = await client.hGet(CHAT_META_KEY, customerId);
    let meta = {};
    try {
      meta = metaRaw ? JSON.parse(metaRaw) : {};
    } catch {
      meta = {};
    }
    meta.lastReadByCustomerAt = Date.now();
    await client.hSet(CHAT_META_KEY, customerId, JSON.stringify(meta));
  } catch (error) {
    console.error("❌ Не удалось сохранить отметку прочтения клиентом:", error.message);
  }
}

// Метаданные одного чата (превью, unread, отметка прочтения) — для истории
// в панели, чтобы не тянуть весь getAndroidChatList ради одного чата.
async function getChatMeta(customerId) {
  if (!customerId) return {};

  try {
    const client = await getRedisClient();
    const metaRaw = await client.hGet(CHAT_META_KEY, customerId);
    return metaRaw ? JSON.parse(metaRaw) : {};
  } catch (error) {
    console.error("❌ Не удалось прочитать метаданные чата:", error.message);
    return {};
  }
}

// Редактирование/удаление сообщения клиента — только в приложении, без
// синхронизации с Telegram (у админа старое сообщение останется как есть).
// Сообщения не имеют собственного ID, поэтому ищем по паре (from:
// "customer", createdAt) — этого достаточно, так как createdAt выставляется
// сервером в момент отправки и уникален для каждого сообщения одного клиента.
async function editChatMessage(customerId, createdAt, newText) {
  if (!customerId || !createdAt || !newText) return false;

  try {
    const client = await getRedisClient();
    const key = `chat:${customerId}`;
    const raw = await client.lRange(key, 0, -1);

    for (let i = 0; i < raw.length; i++) {
      let message;
      try {
        message = JSON.parse(raw[i]);
      } catch {
        continue;
      }

      if (message.from === "customer" && message.createdAt === createdAt && !message.imageUrl && !message.audioUrl) {
        message.text = String(newText);
        message.edited = true;
        await client.lSet(key, i, JSON.stringify(message));
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("❌ Не удалось отредактировать сообщение чата:", error.message);
    return false;
  }
}

async function deleteChatMessage(customerId, createdAt) {
  if (!customerId || !createdAt) return false;

  try {
    const client = await getRedisClient();
    const key = `chat:${customerId}`;
    const raw = await client.lRange(key, 0, -1);

    for (let i = 0; i < raw.length; i++) {
      let message;
      try {
        message = JSON.parse(raw[i]);
      } catch {
        continue;
      }

      if (message.from === "customer" && message.createdAt === createdAt) {
        // Redis-списки не поддерживают удаление по индексу напрямую — по
        // конвенции клиента redis: помечаем уникальным маркером и удаляем
        // все вхождения этого маркера.
        const marker = `__deleted_${Date.now()}_${Math.random()}__`;
        await client.lSet(key, i, marker);
        await client.lRem(key, 1, marker);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("❌ Не удалось удалить сообщение чата:", error.message);
    return false;
  }
}

// Помечает все ещё не помеченные сообщения КЛИЕНТА как прочитанные админом.
// Вызывается вместе с простановкой реакций 👍 в Telegram (см. POST
// /chat/mark-read) — на практике это тот же самый момент, когда админ
// открывает переписку и видит сообщения клиента.
async function markCustomerMessagesRead(customerId) {
  if (!customerId) return;

  try {
    const client = await getRedisClient();
    const key = `chat:${customerId}`;
    const raw = await client.lRange(key, 0, -1);
    let changed = false;

    const updated = raw.map((item) => {
      let message;
      try {
        message = JSON.parse(item);
      } catch {
        return item;
      }
      if (message.from === "customer" && !message.read) {
        message.read = true;
        changed = true;
        return JSON.stringify(message);
      }
      return item;
    });

    if (changed) {
      const multi = client.multi();
      multi.del(key);
      if (updated.length) {
        multi.rPush(key, updated);
      }
      await multi.exec();
      await client.expire(key, 60 * 60 * 24 * 90);
    }

    // Флаг непрочитанного в списке чатов панели сбрасываем в любом случае
    // (даже если changed=false, т.к. могли уже быть все read:true, но
    // unread в мете ещё не сброшен — например, старое сообщение).
    const metaRaw = await client.hGet(CHAT_META_KEY, customerId);
    if (metaRaw) {
      try {
        const meta = JSON.parse(metaRaw);
        meta.unread = false;
        await client.hSet(CHAT_META_KEY, customerId, JSON.stringify(meta));
      } catch {
        // некорректный JSON в мете — не критично, переживёт следующее сообщение
      }
    }
  } catch (error) {
    console.error("❌ Не удалось пометить сообщения клиента прочитанными:", error.message);
  }
}

module.exports = {
  isAndroidCustomerId,
  appendChatMessage,
  getChatMessages,
  getAndroidChatList,
  getChatMeta,
  editChatMessage,
  deleteChatMessage,
  markCustomerMessagesRead,
  markChatReadByCustomer,
  addPendingReaction,
  popPendingReactions
};