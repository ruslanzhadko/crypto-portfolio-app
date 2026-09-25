import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH ?? "";

if (!Number.isInteger(apiId) || !apiHash) {
  throw new Error(
    "Set TELEGRAM_API_ID and TELEGRAM_API_HASH before starting authorization.",
  );
}

async function main() {
  const rl = createInterface({ input, output });
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await client.start({
      phoneNumber: () => rl.question("Telegram phone number: "),
      phoneCode: () => rl.question("Login code: "),
      password: () => rl.question("2FA password (if enabled): "),
      onError: (error) => console.error("[telegram-auth]", error),
    });

    const me = await client.getMe();
    console.log(
      `Authorized as ${"username" in me && me.username ? `@${me.username}` : me.id.toString()}`,
    );
    console.log(
      "\nSave this value as TELEGRAM_USER_SESSION. Treat it like a password:\n",
    );
    console.log(client.session.save());
  } finally {
    rl.close();
    await client.disconnect();
  }
}

void main().catch((error) => {
  console.error("[telegram-auth]", error);
  process.exitCode = 1;
});
