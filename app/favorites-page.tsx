'use client';

import { ArrowUpRight, Star } from 'lucide-react';
import FavoriteStar from '@/components/favorite-star';
import { useI18n } from './language-provider';
import { favoriteFeatureTitle, favoriteFeatureView, type FavoriteTranslator } from '@/lib/trade-status-favorites';

export default function FavoritesPage({ ids, ready, onToggle, onOpen }: {
  ids: string[];
  ready: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const title = (id: string) => favoriteFeatureTitle(id, t as FavoriteTranslator);

  return <section className="favorites-page">
    <div className="page-heading">
      <div>
        <h1>{t('常用功能')}</h1>
        <p>{t('快速開啟已收藏的分析卡片。')}</p>
      </div>
    </div>
    {!ready ? <div className="empty-card" role="status">{t('載入常用功能中…')}</div> : ids.length ? <div className="favorites-page-grid">
      {ids.map(id => <article className="favorite-page-card" key={id}>
        <button type="button" className="favorite-page-open" onClick={() => onOpen(id)}>
          <span className="favorite-page-icon"><Star size={19} fill="currentColor"/></span>
          <span className="favorite-page-copy"><strong>{title(id)}</strong><small>{t(favoriteFeatureView(id) === 'overview' ? '交易總覽' : '交易狀態')}</small></span>
          <ArrowUpRight size={17}/>
        </button>
        <FavoriteStar active title={title(id)} onToggle={() => onToggle(id)} className="favorite-page-remove"/>
      </article>)}
    </div> : <div className="empty-card favorites-empty">
      <Star size={30}/>
      <h2>{t('尚未加入常用功能')}</h2>
      <p>{t('尚未加入常用功能，點擊卡片上的星星即可加入。')}</p>
    </div>}
  </section>;
}
