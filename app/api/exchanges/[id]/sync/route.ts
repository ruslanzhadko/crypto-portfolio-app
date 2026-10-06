import { NextRequest } from "next/server";
import { changeConnection } from "@/lib/exchanges/api";
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => changeConnection(req, (await params).id, "sync");
