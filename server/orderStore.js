const { getRedisClient } = require("./replyMapping");

// ==============================
// Хранилище заказов в Redis — минимальная история заказов для профиля
// клиента в мини-аппе + 3 статуса, которые админ переключает кнопками
// прямо под уведомлением о заказе в Telegram.
// ==============================

const ORDER_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 дней

const STATUS_LABELS = {
  accepted: { label: "Заказ принят", emoji: "🆕" },
  paid: { label: "Оплачен", emoji: "💰" },
  shipped: { label: "Отправлен", emoji: "📦" }
};

function generateOrderId() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function createOrder({ telegramUserId, items, total, storelandOrderNum }) {

  const id = generateOrderId();

  const order = {
    id,
    telegramUserId: telegramUserId ? String(telegramUserId) : null,
    items: items || [],
    total: Number(total) || 0,
    storelandOrderNum: storelandOrderNum || null,
    status: "accepted",
    createdAt: Date.now()
  };

  try {

    const client = await getRedisClient();

    await client.set(`order:${id}`, JSON.stringify(order), { EX: ORDER_TTL_SECONDS });

    if (order.telegramUserId) {
      await client.lPush(`ordersByUser:${order.telegramUserId}`, id);
      await client.lTrim(`ordersByUser:${order.telegramUserId}`, 0, 49);
      await client.expire(`ordersByUser:${order.telegramUserId}`, ORDER_TTL_SECONDS);
    }

  } catch (error) {
    console.error("❌ Не удалось сохранить заказ в Redis:", error.message);
  }

  return order;
}

async function updateOrderStatus(id, status, extra = {}) {

  try {

    const client = await getRedisClient();
    const raw = await client.get(`order:${id}`);

    if (!raw) return null;

    const order = JSON.parse(raw);
    order.status = status;
    order.updatedAt = Date.now();
    Object.assign(order, extra);

    await client.set(`order:${id}`, JSON.stringify(order), { EX: ORDER_TTL_SECONDS });

    return order;

  } catch (error) {
    console.error("❌ Не удалось обновить статус заказа в Redis:", error.message);
    return null;
  }

}

// Привязка "сообщение-запрос трек-номера у админа -> id заказа" — недолгая,
// нужна только пока админ не ответит трек-номером
async function saveTrackingRequest(messageId, orderId) {
  try {
    const client = await getRedisClient();
    await client.set(`trackingRequest:${messageId}`, orderId, { EX: 60 * 60 * 24 });
  } catch (error) {
    console.error("❌ Не удалось сохранить trackingRequest в Redis:", error.message);
  }
}

async function getTrackingRequest(messageId) {
  try {
    const client = await getRedisClient();
    return await client.get(`trackingRequest:${messageId}`);
  } catch (error) {
    console.error("❌ Не удалось прочитать trackingRequest из Redis:", error.message);
    return null;
  }
}

async function getOrdersForUser(telegramUserId) {

  try {

    const client = await getRedisClient();
    const ids = await client.lRange(`ordersByUser:${telegramUserId}`, 0, 49);

    if (!ids.length) return [];

    const raws = await Promise.all(ids.map(id => client.get(`order:${id}`)));

    return raws.filter(Boolean).map(raw => JSON.parse(raw));

  } catch (error) {
    console.error("❌ Не удалось получить заказы пользователя из Redis:", error.message);
    return [];
  }

}

module.exports = {
  STATUS_LABELS,
  createOrder,
  updateOrderStatus,
  getOrdersForUser,
  saveTrackingRequest,
  getTrackingRequest
};
