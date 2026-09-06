/**
 * 5.2 ホーム画面のカスタマイズ機能
 * ユーザーごとの表示カード・表示順・メール表示件数を PropertiesService(User) に保存する。
 */
namespace UserSettingsService {
  const PROPERTY_KEY = "USER_SETTINGS";

  const DEFAULT_SETTINGS: UserSettings = {
    cardOrder: ["calendar", "mail", "links"],
    mailCount: 5,
    visibleCards: ["calendar", "mail", "links"],
  };

  const ALL_CARDS: CardId[] = ["calendar", "mail", "links"];

  export function getSettings(): UserSettings {
    const raw = PropertiesService.getUserProperties().getProperty(PROPERTY_KEY);
    if (!raw) {
      return cloneDefaults();
    }
    try {
      const parsed = JSON.parse(raw) as Partial<UserSettings>;
      return sanitize(parsed);
    } catch (e) {
      return cloneDefaults();
    }
  }

  export function saveSettings(settings: Partial<UserSettings>): UserSettings {
    const sanitized = sanitize(settings);
    PropertiesService.getUserProperties().setProperty(
      PROPERTY_KEY,
      JSON.stringify(sanitized)
    );
    return sanitized;
  }

  export function sanitize(input: Partial<UserSettings>): UserSettings {
    const cardOrder = Array.isArray(input.cardOrder)
      ? input.cardOrder.filter((c): c is CardId => ALL_CARDS.indexOf(c) !== -1)
      : DEFAULT_SETTINGS.cardOrder;
    const visibleCards = Array.isArray(input.visibleCards)
      ? input.visibleCards.filter((c): c is CardId => ALL_CARDS.indexOf(c) !== -1)
      : DEFAULT_SETTINGS.visibleCards;
    const mailCountRaw = typeof input.mailCount === "number" ? input.mailCount : DEFAULT_SETTINGS.mailCount;
    const mailCount = Math.min(20, Math.max(1, Math.floor(mailCountRaw)));

    // cardOrder に欠けているカードIDを末尾に補完（設定の不整合対策）
    const completedOrder = cardOrder.concat(
      ALL_CARDS.filter((c) => cardOrder.indexOf(c) === -1)
    );

    return {
      cardOrder: completedOrder,
      mailCount: mailCount,
      visibleCards: visibleCards.length > 0 ? visibleCards : DEFAULT_SETTINGS.visibleCards,
    };
  }

  function cloneDefaults(): UserSettings {
    return {
      cardOrder: DEFAULT_SETTINGS.cardOrder.slice(),
      mailCount: DEFAULT_SETTINGS.mailCount,
      visibleCards: DEFAULT_SETTINGS.visibleCards.slice(),
    };
  }
}
