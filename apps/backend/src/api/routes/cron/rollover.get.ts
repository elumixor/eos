import { prisma } from "services/prisma";
import { handler } from "utils";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export default handler(async () => {
  const today = todayDate();
  const result = await prisma.task.updateMany({
    where: { completed: false, date: { not: null, lt: today } },
    data: { date: today },
  });
  return { today, moved: result.count };
});
