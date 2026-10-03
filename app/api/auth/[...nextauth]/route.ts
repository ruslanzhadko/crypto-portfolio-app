import { handlers } from '@/lib/auth';
import { withTelegramState } from '@/lib/auth/telegram-state';

export const GET = withTelegramState(handlers.GET);
export const POST = withTelegramState(handlers.POST);
