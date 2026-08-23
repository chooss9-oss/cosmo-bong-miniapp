const { getRedisClient } = require("./replyMapping");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

// Firebase Admin — нужен только для отправки Web Push (уведомления клиентам
// на iPhone/десктопе через браузер). Android по-прежнему идёт через
// Expo Push (см. sendExpoPush ниже) — это никак не пересекается.
if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require("./firebase-service-account.json");
  initializeApp({
    credential: cert(serviceAccount),
  });
}

async function sendWebPush(token, { title, body }) {
  if (!token) return { ok: false, error: "no_token" };

  try {
    // Только data, без notification — иначе браузер показывает уведомление
    // сам, а наш обработчик onBackgroundMessage показывает второе, и клиенту
    // приходит два одинаковых push.
    await getMessaging().send({
      token,
      data: { title: String(title || ""), body: String(body || "") },
    });
    return { ok: true };
  } catch (error) {
    console.error("❌ Не удалось отправить web push:", error.message);
    return { ok: false, error: error.message };
  }
}

// ==============================
// Push-токены Android-приложения (Expo Push Token) — по одному на клиента
// (customerId = "android:<телефон>"). Используются, чтобы доставить
// сообщение админа из чата прямо на телефон клиента, даже если приложение
// закрыто.
// ==============================

async function savePushToken(customerId, token, platform = "android") {
  if (!customerId || !token) return;

  try {
    const client = await getRedisClient();
    await client.set(`pushToken:${customerId}:${platform}`, String(token));
  } catch (error) {
    console.error("❌ Не удалось сохранить push-токен:", error.message);
  }
}

async function getPushToken(customerId, platform = "android") {
  if (!customerId) return null;

  try {
    const client = await getRedisClient();
    return await client.get(`pushToken:${customerId}:${platform}`);
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
  sendExpoPush,
  sendWebPush
};
