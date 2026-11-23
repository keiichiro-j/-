// 天気と時間帯（設計書 8章）。担当：FX・サウンド。World から使う最小のインターフェース：
//   update(dt) / drawFront(ctx, cam, vw, vh) / wet / wind / darkness / sky{top,bottom} / tint / timeOfDay / weather
export function createEnv(world, levelData) {
  return {
    weather: (levelData.weathers || ['sunny'])[0],
    timeOfDay: levelData.timeOfDay || 'day',
    wet: false, wind: 0, darkness: 0, flash: 0,
    sky: { top: '#6fb7ff', bottom: '#d8f0ff' },
    tint: null,
    update(dt) {},
    drawFront(ctx, cam, vw, vh) {},
  };
}
