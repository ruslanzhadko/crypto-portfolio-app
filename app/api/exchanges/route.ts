import { listConnections, createConnection } from "@/lib/exchanges/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = listConnections;
export const POST = createConnection;
