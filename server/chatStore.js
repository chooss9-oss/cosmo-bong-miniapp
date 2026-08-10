const { getRedisClient } = require("./replyMapping");

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

function isAndroidCustomerId(customerId) {
  return typeof customerId === "string" && customerId.startsWith("android:");
}

async function appendChatMessage(customerId, { from, text }) {
  if (!customerId || !text) return null;

  const message = {
    from, // "admin" | "customer"
    text: String(text),
    createdAt: Date.now()
  };

  try {
    const client = await getRedisClient();
    const key = `chat:${customerId}`;
    await client.rPush(key, JSON.stringify(message));
    await client.lTrim(key, -MAX_MESSAGES, -1);
    // Храним 90 дней с момента последнего сообщения
    await client.expire(key, 60 * 60 * 24 * 90);
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

module.exports = {
  isAndroidCustomerId,
  appendChatMessage,
  getChatMessages
};
