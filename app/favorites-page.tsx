'use client';

import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import { useI18n } from './language-provider';

export default function FavoritesPage({ ids, ready, error, onRetry, children }: {
  ids: string[];
  ready: boolean;
  error?: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return <section className="favorites-page">
    <div className="page-heading">
      <div>
        <h1>{t('常用功能')}</h1>
        <p>{t('直接查看已收藏的卡片內容。')}</p>
      </div>
    </div>
    {!ready ? <div className="empty-card" role="status">{t('載入常用功能中…')}</div> : error ? <div className="empty-card" role="alert">
      <h2>{t('暫時無法載入紀錄')}</h2>
      <p>{t(error)}</p>
      <button className="outline-button" onClick={onRetry}>{t('重新載入')}</button>
    </div> : ids.length ? <div className="favorites-page-content">{children}</div> : <div className="empty-card favorites-empty">
      <Star size={30}/>
      <h2>{t('尚未加入常用功能')}</h2>
      <p>{t('尚未加入常用功能，點擊卡片上的星星即可加入。')}</p>
    </div>}
  </section>;
}
