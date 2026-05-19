import { env } from "env";
import { prisma } from "services/prisma";

const API = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

async function sendMessage(chatId: number | string, text: string, options?: { reply_markup?: unknown }) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", ...options }),
  });
}

async function getToday() {
  const date = todayDate();
  const tasks = await prisma.task.findMany({
    where: { date },
    orderBy: { order: "asc" },
  });
  return { date, tasks };
}

function formatDayTasks(day: { date: string; tasks: { text: string; completed: boolean }[] }) {
  if (!day.tasks.length) return `*${day.date}*\n_No tasks yet._`;
  const lines = day.tasks.map((t, i) => `${t.completed ? "~" : ""}${i + 1}. ${t.text}${t.completed ? "~" : ""}`);
  return `*${day.date}*\n${lines.join("\n")}`;
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
      "*Eos Bot*\n\n" +
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
    await sendMessage(chatId, formatDayTasks(day));
    return;
  }

  // /add <task>
  if (text.startsWith("/add ")) {
    const taskText = text.slice(5).trim();
    if (!taskText) return sendMessage(chatId, "Usage: /add <task text>");

    const date = todayDate();
    const maxOrder = await prisma.task.aggregate({ where: { date }, _max: { order: true } });

    await prisma.task.create({
      data: { text: taskText, date, order: (maxOrder._max.order ?? -1) + 1 },
    });

    await sendMessage(chatId, formatDayTasks(await getToday()));
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
    await sendMessage(chatId, formatDayTasks(await getToday()));
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
    await sendMessage(chatId, formatDayTasks(await getToday()));
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
    await sendMessage(chatId, formatDayTasks(await getToday()));
    return;
  }

  // Default: treat as a task to add
  const date = todayDate();
  const maxOrder = await prisma.task.aggregate({ where: { date }, _max: { order: true } });
  await prisma.task.create({
    data: { text, date, order: (maxOrder._max.order ?? -1) + 1 },
  });
  await sendMessage(chatId, `Added!\n\n${formatDayTasks(await getToday())}`);
}
