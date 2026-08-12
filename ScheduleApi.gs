/**
 * ScheduleApi.gs
 * html/Schedule* から google.script.run で呼び出すAPI群。
 */

function schedApi_getBootstrap() {
  return {
    offices: getScheduleOffices(),
    typeMeta: SCHEDULE_EVENT_TYPE_META,
    typeOrder: SCHEDULE_EVENT_TYPE_ORDER,
    currentUserEmail: Session.getActiveUser().getEmail(),
    canEdit: isScheduleEditor_(),
    today: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
  };
}

/**
 * 指定年月のカレンダーグリッド（前後月のはみ出し分を含む）とイベントをまとめて返す。
 */
function schedApi_getMonthView(year, month, officeFilter) {
  var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var grid = buildCalendarGrid_(year, month, todayStr);
  var startDate = grid[0].date;
  var endDate = grid[grid.length - 1].date;
  var events = listScheduleEvents(startDate, endDate, officeFilter || '');
  return { grid: grid, eventsByDate: groupEventsByDate_(events, SCHEDULE_EVENT_TYPE_ORDER) };
}

function schedApi_getEventsForDate(dateStr, officeFilter) {
  var events = listScheduleEvents(dateStr, dateStr, officeFilter || '');
  var byDate = groupEventsByDate_(events, SCHEDULE_EVENT_TYPE_ORDER);
  return byDate[dateStr] || [];
}

function schedApi_createEvent(event) {
  return createScheduleEvent(event);
}

function schedApi_updateEvent(id, patch) {
  return updateScheduleEvent(id, patch);
}

function schedApi_deleteEvent(id) {
  deleteScheduleEvent(id);
  return { ok: true };
}

function schedApi_addOffice(name) {
  return addScheduleOffice(name);
}
