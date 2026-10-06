import { NextRequest } from "next/server";
import { changeConnection } from "@/lib/exchanges/api";
export const POST = (
  req: NextRequest,
  { params }: { params: { id: string } },
) => changeConnection(req, params.id, "credentials");
