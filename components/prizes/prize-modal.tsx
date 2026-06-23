'use client';

import Image from 'next/image';
import { X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PrizeType } from '@/contexts/prize-context';

const PRIZE_CONFIG: Record<PrizeType, { title: string; description: string; url: string }> = {
  REGISTER: {
    title: 'Добро пожаловать!',
    description:
      'Вы успешно зарегистрировались в CryptoPortfolio и получили награду. Нажмите кнопку ниже, чтобы забрать свой приз.',
    url: 'https://t.me/send?start=CQpCrZqVVg2T',
  },
  LOGIN: {
    title: 'С возвращением!',
    description:
      'Спасибо, что пользуетесь CryptoPortfolio. За вход в систему вы получили награду. Нажмите кнопку ниже, чтобы забрать свой приз.',
    url: 'https://t.me/send?start=CQIU8mDsoplr',
  },
  TWO_WALLETS: {
    title: 'Два кошелька добавлено!',
    description:
      'Отлично! Вы подключили 2 кошелька к CryptoPortfolio и получили награду. Нажмите кнопку ниже, чтобы забрать свой приз.',
    url: 'https://t.me/send?start=CQ8sZi41QlQW',
  },
  TELEGRAM: {
    title: 'Telegram подключён!',
    description:
      'Теперь вы будете получать уведомления об изменениях цен прямо в Telegram. За подключение бота вы получили награду.',
    url: 'https://t.me/send?start=CQtTsMuByF2u',
  },
  TRIGGER: {
    title: 'Первый триггер создан!',
    description:
      'Теперь система будет отслеживать цены по вашим условиям. За создание первого триггера вы получили награду.',
    url: 'https://t.me/send?start=CQM4p5PUuzXu',
  },
};

interface PrizeModalProps {
  type: PrizeType;
  onClose: () => void;
  onClaim: () => void;
}

export function PrizeModal({ type, onClose, onClaim }: PrizeModalProps) {
  const config = PRIZE_CONFIG[type];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface-1 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-text-muted transition-colors hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex justify-center">
          <Image
            src="/logo2.png"
            alt="CryptoPortfolio"
            width={96}
            height={96}
            className="rounded-full"
          />
        </div>

        <div className="mb-6 text-center">
          <h2 className="mb-2 text-xl font-semibold text-text">{config.title}</h2>
          <p className="text-sm leading-relaxed text-text-muted">{config.description}</p>
        </div>

        <div className="space-y-2">
          <Button asChild className="w-full" onClick={onClaim}>
            <a href={config.url} target="_blank" rel="noreferrer">
              Забрать приз
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Позже
          </Button>
        </div>
      </div>
    </div>
  );
}
