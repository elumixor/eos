import { prisma } from "services/prisma";
import { handler } from "utils";

export default handler(() =>
  prisma.task.findMany({
    orderBy: [{ date: "asc" }, { order: "asc" }],
  }),
);
