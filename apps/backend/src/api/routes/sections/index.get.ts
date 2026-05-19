import { prisma } from "services/prisma";
import { handler } from "utils";

export default handler(() =>
  prisma.section.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  }),
);
