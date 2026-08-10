const { getRedisClient } = require("./replyMapping");

// ==============================
// Push-токены Android-приложения (Expo Push Token) — по одному на клиента
// (customerId = "android:<телефон>"). Используются, чтобы доставить
// сообщение админа из чата прямо на телефон клиента, даже если приложение
// закрыто.
// ==============================

async function savePushToken(customerId, token) {
  if (!customerId || !token) return;

  try {
    const client = await getRedisClient();
    await client.set(`pushToken:${customerId}`, String(token));
  } catch (error) {
    console.error("❌ Не удалось сохранить push-токен:", error.message);
  }
}

async function getPushToken(customerId) {
  if (!customerId) return null;

  try {
    const client = await getRedisClient();
    return await client.get(`pushToken:${customerId}`);
  } catch (error) {
    console.error("❌ Не удалось прочитать push-токен:", error.message);
    return null;
  }
}

// Отправка через Expo Push API — токен вида "ExponentPushToken[...]",
// авторизация не требуется для базовой отправки.
async function sendExpoPush(token, { title, body, data }) {
  if (!token) return { ok: false, error: "no_token" };

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data,
        sound: "default"
      })
    });

    const result = await response.json();
    const ticket = result && result.data;

    if (ticket && ticket.status === "error") {
      console.error("❌ Expo push error:", ticket.message);
      return { ok: false, error: ticket.message };
    }

    return { ok: true };
  } catch (error) {
    console.error("❌ Не удалось отправить push:", error.message);
    return { ok: false, error: error.message };
  }
}

module.exports = {
  savePushToken,
  getPushToken,
  sendExpoPush
};
