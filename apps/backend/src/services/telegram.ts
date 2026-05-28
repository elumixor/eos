import { env } from "env";
import { prisma } from "services/prisma";

const API = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

// Telegram bot has no per-chat user mapping yet. Pin all bot-side writes to
// the seed/owner user; revisit once we support linking chatId -> userId.
const TELEGRAM_OWNER_USER_ID = "user_seed_vladogim97";

async function sendMessage(chatId: number | string, text: string, options?: { reply_markup?: unknown }) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", ...options }),
  });
}

async function getToday() {
  const tasks = await prisma.task.findMany({
    where: { bucket: "today", userId: TELEGRAM_OWNER_USER_ID, deletedAt: null },
    orderBy: { order: "asc" },
  });
  return { tasks };
}

function formatTodayTasks(day: { tasks: { text: string; completed: boolean }[] }) {
  if (!day.tasks.length) return `*Today*\n_No tasks yet._`;
  const lines = day.tasks.map((t, i) => `${t.completed ? "~" : ""}${i + 1}. ${t.text}${t.completed ? "~" : ""}`);
  return `*Today*\n${lines.join("\n")}`;
}

async function addToday(text: string) {
  const maxOrder = await prisma.task.aggregate({
    where: { bucket: "today", userId: TELEGRAM_OWNER_USER_ID },
    _max: { order: true },
  });
  await prisma.task.create({
    data: {
      userId: TELEGRAM_OWNER_USER_ID,
      text,
      bucket: "today",
      scheduledAt: new Date(),
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

export async function handleTelegramUpdate(update: Record<string, unknown>) {
  const message = update.message as { chat: { id: number }; text?: string } | undefined;
  if (!message?.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  // /start or /help
  if (text === "/start" || text === "/help") {
    await sendMessage(
      chatId,
      "*PureType Bot*\n\n" +
        "/today - Show today's tasks\n" +
        "/add <task> - Add a task\n" +
        "/done <number> - Complete a task\n" +
        "/undo <number> - Uncomplete a task\n" +
        "/delete <number> - Delete a task\n",
    );
    return;
  }

  // /today
  if (text === "/today") {
    const day = await getToday();
    await sendMessage(chatId, formatTodayTasks(day));
    return;
  }

  // /add <task>
  if (text.startsWith("/add ")) {
    const taskText = text.slice(5).trim();
    if (!taskText) return sendMessage(chatId, "Usage: /add <task text>");
    await addToday(taskText);
    await sendMessage(chatId, formatTodayTasks(await getToday()));
    return;
  }

  // /done <number>
  if (text.startsWith("/done ")) {
    const num = Number.parseInt(text.slice(6).trim(), 10);
    if (Number.isNaN(num)) return sendMessage(chatId, "Usage: /done <task number>");

    const day = await getToday();
    const task = day.tasks[num - 1];
    if (!task) return sendMessage(chatId, `Task #${num} not found.`);

    await prisma.task.update({ where: { id: task.id }, data: { completed: true } });
    await sendMessage(chatId, formatTodayTasks(await getToday()));
    return;
  }

  // /undo <number>
  if (text.startsWith("/undo ")) {
    const num = Number.parseInt(text.slice(6).trim(), 10);
    if (Number.isNaN(num)) return sendMessage(chatId, "Usage: /undo <task number>");

    const day = await getToday();
    const task = day.tasks[num - 1];
    if (!task) return sendMessage(chatId, `Task #${num} not found.`);

    await prisma.task.update({ where: { id: task.id }, data: { completed: false } });
    await sendMessage(chatId, formatTodayTasks(await getToday()));
    return;
  }

  // /delete <number>
  if (text.startsWith("/delete ")) {
    const num = Number.parseInt(text.slice(8).trim(), 10);
    if (Number.isNaN(num)) return sendMessage(chatId, "Usage: /delete <task number>");

    const day = await getToday();
    const task = day.tasks[num - 1];
    if (!task) return sendMessage(chatId, `Task #${num} not found.`);

    await prisma.task.delete({ where: { id: task.id } });
    await sendMessage(chatId, formatTodayTasks(await getToday()));
    return;
  }

  // Default: treat as a task to add
  await addToday(text);
  await sendMessage(chatId, `Added!\n\n${formatTodayTasks(await getToday())}`);
}
