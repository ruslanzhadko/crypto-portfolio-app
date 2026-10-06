import { NextRequest } from "next/server";
import { getConnection, changeConnection } from "@/lib/exchanges/api";
export const dynamic = "force-dynamic";
type Context = { params: { id: string } };
export const GET = (_req: NextRequest, { params }: Context) =>
  getConnection(params.id);
export const PATCH = (req: NextRequest, { params }: Context) =>
  changeConnection(req, params.id, "settings");
export const DELETE = (req: NextRequest, { params }: Context) =>
  changeConnection(req, params.id, "disconnect");
