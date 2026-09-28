import { marketName, type Trade } from './trades';

export const tradeStatusFavoriteCards = [
  { id: 'score', title: '交易分數' },
  { id: 'risk', title: '風險偏好' },
  { id: 'community', title: '本週結算排行' },
  { id: 'symbols', title: '最常交易商品' },
  { id: 'mistakes', title: '常犯錯誤' },
  { id: 'time-preference', title: '交易時間偏好' },
  { id: 'strategies', title: '交易策略偏好' },
  { id: 'best-day', title: '最好的一天佔本期獲利日總額' },
  { id: 'market-metrics', title: '各市場交易統計' },
  { id: 'summary', title: '交易週報' },
  { id: 'best-worst-time', title: '最佳與最低勝率時間' },
  { id: 'comparison', title: '與前一個等長期間比較' },
  { id: 'rules', title: '所選期間遵守的規則' },
] as const;

export type TradeStatusFavoriteId = string;
export type FavoriteTranslator = (text: string, values?: unknown[]) => string;

export function tradeStatusFavoriteDomId(id: TradeStatusFavoriteId) {
  return `trade-status-favorite-${encodeURIComponent(id)}`;
}

export function tradeStatusFavoriteTitle(id: TradeStatusFavoriteId, t: FavoriteTranslator) {
  const fixed = tradeStatusFavoriteCards.find(card => card.id === id);
  if (fixed) return t(fixed.title);

  const parts = id.split(':');
  if (parts.length === 3 && parts[0] === 'market-stat') {
    return `${t('各市場交易統計')} · ${t(marketName(parts[1] as Trade['market']))} · ${parts[2]}`;
  }
  if (parts.length === 3 && parts[0] === 'time-chart') {
    return `${t('最佳與最低勝率時間')} · ${t(marketName(parts[1] as Trade['market']))} · ${parts[2]}`;
  }
  return t('常用功能');
}
