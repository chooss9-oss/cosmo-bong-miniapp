const { getRedisClient } = require("./replyMapping");
const { telegramApi } = require("./replyMapping");
const { appendChatMessage } = require("./chatStore");
const { getPushToken, sendExpoPush, sendWebPush } = require("./pushStore");

// ==============================
// Напоминание о брошенной корзине. Корзина хранится только на клиенте
// (AsyncStorage в приложении, localStorage в мини-аппе) — сервер о ней
// ничего не знает, поэтому клиент сам сообщает сюда её состояние при
// каждом изменении (добавление/удаление товара) через POST /api/cart-sync.
// id — telegramUserId для Telegram Mini App, "android:<телефон>" для
// Android/iPhone-приложения (тот же формат customerId, что и в чате).
// ==============================

const HOUR_MS = 60 * 60 * 1000;
const FIRST_REMINDER_HOURS = 6;
const SECOND_REMINDER_HOURS = 24;

const CART_INDEX_KEY = "cartIndex";

async function saveCart(id, platform, items) {
  if (!id) return;

  try {
    const client = await getRedisClient();

    if (!items || !items.length) {
      await client.del(`cart:${id}`);
      await client.zRem(CART_INDEX_KEY, id);
      return;
    }

    const existingRaw = await client.get(`cart:${id}`);
    const existing = existingRaw ? JSON.parse(existingRaw) : null;

    const cart = {
      id,
      platform,
      items,
      // Обновляем updatedAt только если реально что-то изменилось в составе
      // корзины — иначе таймер напоминаний сбрасывался бы каждый раз,
      // когда клиент просто открывает приложение с той же корзиной.
      updatedAt:
        existing && JSON.stringify(existing.items) === JSON.stringify(items)
          ? existing.updatedAt
          : Date.now(),
      reminderCount:
        existing && JSON.stringify(existing.items) === JSON.stringify(items)
          ? existing.reminderCount || 0
          : 0
    };

    await client.set(`cart:${id}`, JSON.stringify(cart), { EX: 60 * 60 * 24 * 7 });
    await client.zAdd(CART_INDEX_KEY, { score: cart.updatedAt, value: id });

  } catch (error) {
    console.error("❌ Не удалось сохранить корзину:", error.message);
  }
}

async function clearCart(id) {
  if (!id) return;

  try {
    const client = await getRedisClient();
    await client.del(`cart:${id}`);
    await client.zRem(CART_INDEX_KEY, id);
  } catch (error) {
    console.error("❌ Не удалось очистить корзину:", error.message);
  }
}

async function markCartReminderSent(id, count) {
  try {
    const client = await getRedisClient();
    const raw = await client.get(`cart:${id}`);
    if (!raw) return;
    const cart = JSON.parse(raw);
    cart.reminderCount = count;
    await client.set(`cart:${id}`, JSON.stringify(cart), { EX: 60 * 60 * 24 * 7 });
  } catch (error) {
    console.error("❌ Не удалось обновить счётчик напоминаний корзины:", error.message);
  }
}

// Отправка напоминания клиенту — общая логика что для Telegram (обычное
// сообщение боту), что для Android/iPhone (сообщение в чат приложения +
// push), по аналогии с notifyCustomer в orderFlow.js.
async function sendCartReminder(cart, text) {

  if (cart.platform === "android") {

    await appendChatMessage(cart.id, { from: "admin", text });

    const pushToken = await getPushToken(cart.id, "android");
    await sendExpoPush(pushToken, { title: "Cosmo Bong", body: text, data: { type: "chat" } });

    const webPushToken = await getPushToken(cart.id, "web");
    if (webPushToken) {
      await sendWebPush(webPushToken, { title: "Cosmo Bong", body: text });
    }

  } else {

    await telegramApi("sendMessage", { chat_id: cart.id, text }).catch((err) => {
      console.error("❌ Не удалось отправить напоминание о корзине в Telegram:", err.message);
    });

  }

}

// Проходит по всем активным (непустым) корзинам и шлёт напоминания —
// вызывается по расписанию (см. /api/check-abandoned-carts)
async function checkAbandonedCarts() {

  try {

    const client = await getRedisClient();
    const ids = await client.zRange(CART_INDEX_KEY, 0, -1);

    if (!ids.length) return;

    const now = Date.now();

    for (const id of ids) {

      try {

        const raw = await client.get(`cart:${id}`);
        if (!raw) {
          await client.zRem(CART_INDEX_KEY, id);
          continue;
        }

        const cart = JSON.parse(raw);
        if (!cart.items || !cart.items.length) {
          await client.zRem(CART_INDEX_KEY, id);
          continue;
        }

        const hoursElapsed = (now - cart.updatedAt) / HOUR_MS;
        const remindersSent = cart.reminderCount || 0;

        if (hoursElapsed >= SECOND_REMINDER_HOURS && remindersSent < 2) {

          await sendCartReminder(
            cart,
            "👋 Товары всё ещё в вашей корзине! Оформите заказ сейчас, чтобы не потерять их — наличие может измениться."
          );
          await markCartReminderSent(id, 2);

        } else if (hoursElapsed >= FIRST_REMINDER_HOURS && remindersSent < 1) {

          await sendCartReminder(
            cart,
            "🌿 Вы оставили товары в корзине — оформите заказ, пока всё в наличии!"
          );
          await markCartReminderSent(id, 1);

        }

      } catch (innerError) {
        console.error(`❌ Ошибка проверки корзины ${id}:`, innerError.message);
      }

    }

  } catch (error) {
    console.error("❌ Ошибка проверки брошенных корзин:", error.message);
  }

}

module.exports = {
  saveCart,
  clearCart,
  checkAbandonedCarts
};