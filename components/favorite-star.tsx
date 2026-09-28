'use client';

import { Star } from 'lucide-react';
import { useI18n } from '@/app/language-provider';

export default function FavoriteStar({ active, title, onToggle, className = '' }: { active: boolean; title: string; onToggle: () => void; className?: string }) {
  const { t } = useI18n();
  const action = t(active ? '從常用功能移除' : '加入常用功能');

  return <button
    type="button"
    className={`favorite-star-button${active ? ' active' : ''}${className ? ` ${className}` : ''}`}
    aria-label={`${action}：${title}`}
    aria-pressed={active}
    title={action}
    onClick={onToggle}
  ><Star size={17} fill={active ? 'currentColor' : 'none'} strokeWidth={active ? 2.3 : 1.8}/></button>;
}
