const { createClient } = require("redis");

// ==============================
// REDIS — общий клиент + привязка "сообщение у админа -> чат клиента",
// чтобы Reply на ЛЮБОЕ сообщение, связанное с конкретным клиентом
// (пересланное сообщение или уведомление о заказе), уходило именно ему.
// ==============================

let redisClient = null;

async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  redisClient = createClient({ url: process.env.REDIS_URL });

  redisClient.on("error", (err) => {
    console.error("❌ Redis Client Error:", err.message);
  });

  const connectStart = Date.now();
  await redisClient.connect();
  console.log(`Redis connect() took ${Date.now() - connectStart}ms`);

  return redisClient;
}

async function saveReplyMapping(messageId, customerChatId) {
  try {
    const client = await getRedisClient();
    // Храним 14 дней — достаточно для переписки по заказу, дальше само сотрётся
    await client.set(`replyMap:${messageId}`, String(customerChatId), { EX: 60 * 60 * 24 * 14 });
  } catch (error) {
    console.error("❌ Не удалось сохранить replyMap в Redis:", error.message);
  }
}

async function getReplyMapping(messageId) {
  try {
    const client = await getRedisClient();
    return await client.get(`replyMap:${messageId}`);
  } catch (error) {
    console.error("❌ Не удалось прочитать replyMap из Redis:", error.message);
    return null;
  }
}

async function telegramApi(method, payload) {
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
  return response.json();
}

// Отправка файла (например голосового сообщения) реальными байтами, а не
// ссылкой/file_id — Telegram Bot API для этого требует multipart/form-data,
// обычный JSON-запрос (telegramApi выше) для файлов не подходит. Node 18+
// (среда Vercel Functions) даёт нативные FormData/Blob, поэтому отдельная
// библиотека (form-data и т.п.) не нужна.
async function telegramApiFile(method, fields, fileFieldName, buffer, filename, mimeType) {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields || {})) {
    if (value !== undefined && value !== null) {
      form.append(key, String(value));
    }
  }

  form.append(fileFieldName, new Blob([buffer], { type: mimeType }), filename);

  const response = await fetch(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`,
    { method: "POST", body: form }
  );
  return response.json();
}

module.exports = {
  getRedisClient,
  saveReplyMapping,
  getReplyMapping,
  telegramApi,
  telegramApiFile
};
