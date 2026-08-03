const { getRedisClient } = require("./replyMapping");

// ==============================
// Хранилище заказов в Redis — история заказов для профиля клиента в
// мини-аппе + статусы, которые переключаются кнопками прямо в Telegram.
// ==============================

const ORDER_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 дней

const STATUS_LABELS = {
  accepted: { label: "Заказ принят", emoji: "🆕" },
  confirmed: { label: "Подтверждён", emoji: "✅" },
  paid: { label: "Оплачен", emoji: "💰" },
  shipped: { label: "Отправлен", emoji: "📦" },
  ready: { label: "Готов к самовывозу", emoji: "📍" }
};

function generateOrderId() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function createOrder({ telegramUserId, items, total, storelandOrderNum, pointsUsed }) {

  const id = generateOrderId();

  const order = {
    id,
    telegramUserId: telegramUserId ? String(telegramUserId) : null,
    items: items || [],
    total: Number(total) || 0,
    pointsUsed: Number(pointsUsed) || 0,
    storelandOrderNum: storelandOrderNum || null,
    status: "accepted",
    // deliveryMethod: "cdek" | "pochta" | "pickup_yar" | "delivery_yar"
    deliveryMethod: null,
    // paymentMethod: "qr" | "transfer"
    paymentMethod: null,
    shippingData: null,
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

async function getOrder(id) {
  try {
    const client = await getRedisClient();
    const raw = await client.get(`order:${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("❌ Не удалось прочитать заказ из Redis:", error.message);
    return null;
  }
}

async function updateOrder(id, extra = {}) {

  try {

    const client = await getRedisClient();
    const raw = await client.get(`order:${id}`);

    if (!raw) return null;

    const order = JSON.parse(raw);
    Object.assign(order, extra);
    order.updatedAt = Date.now();

    await client.set(`order:${id}`, JSON.stringify(order), { EX: ORDER_TTL_SECONDS });

    return order;

  } catch (error) {
    console.error("❌ Не удалось обновить заказ в Redis:", error.message);
    return null;
  }

}

// Сохраняем предыдущее имя функции как алиас — updateOrderStatus(id, status, extra)
async function updateOrderStatus(id, status, extra = {}) {
  return updateOrder(id, { status, ...extra });
}

// ==============================
// Короткоживущие привязки для многошагового диалога по заказу
// ==============================

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

// Клиент выбрал СДЭК/Почту и должен прислать данные получателя одним
// сообщением — помечаем, что следующее его сообщение это данные, а не
// обычный вопрос
async function saveAwaitingShippingData(customerChatId, orderId) {
  try {
    const client = await getRedisClient();
    await client.set(`awaitingShipping:${customerChatId}`, orderId, { EX: 60 * 60 * 24 * 3 });
  } catch (error) {
    console.error("❌ Не удалось сохранить awaitingShipping в Redis:", error.message);
  }
}

async function getAwaitingShippingData(customerChatId) {
  try {
    const client = await getRedisClient();
    return await client.get(`awaitingShipping:${customerChatId}`);
  } catch (error) {
    console.error("❌ Не удалось прочитать awaitingShipping из Redis:", error.message);
    return null;
  }
}

async function clearAwaitingShippingData(customerChatId) {
  try {
    const client = await getRedisClient();
    await client.del(`awaitingShipping:${customerChatId}`);
  } catch (error) {
    console.error("❌ Не удалось очистить awaitingShipping в Redis:", error.message);
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
  getOrder,
  updateOrder,
  updateOrderStatus,
  getOrdersForUser,
  saveTrackingRequest,
  getTrackingRequest,
  saveAwaitingShippingData,
  getAwaitingShippingData,
  clearAwaitingShippingData
};
