import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import qrcode from "qrcode-terminal";

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
    if (process.argv.includes("--qr")) {
      await client.connect();
      console.log("Telegram на телефоне → Настройки → Устройства → Подключить устройство.\n");
      await client.signInUserWithQrCode({ apiId, apiHash }, {
        qrCode: async ({ token }) => {
          console.log("Отсканируйте этот QR-код (он обновляется автоматически):");
          qrcode.generate(`tg://login?token=${token.toString("base64url")}`, { small: true });
        },
        password: () => rl.question("2FA password (if enabled): "),
        onError: (error) => { console.error("[telegram-auth]", error.message); return Promise.resolve(true); },
      });
    } else await client.start({
      phoneNumber: () => rl.question("Telegram phone number: "),
      phoneCode: (viaApp) => rl.question(viaApp
        ? "Код отправлен в служебный чат Telegram. Login code: "
        : "Проверьте способ доставки кода Telegram (SMS/email). Login code: "),
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
