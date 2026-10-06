import { NextRequest } from "next/server";
import { getConnection, changeConnection } from "@/lib/exchanges/api";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export const GET = async (_req: NextRequest, { params }: Context) =>
  getConnection((await params).id);
export const PATCH = async (req: NextRequest, { params }: Context) =>
  changeConnection(req, (await params).id, "settings");
export const DELETE = async (req: NextRequest, { params }: Context) =>
  changeConnection(req, (await params).id, "disconnect");
