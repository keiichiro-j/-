/**
 * 4. Calendar機能
 * 予定の作成・編集・削除／ゲスト招待、複数カレンダー統合表示。
 */
namespace CalendarService {
  /** "a@example.com, b@example.com" のようなCSV文字列を整形済みメール配列に変換する（純粋関数） */
  export function parseGuestsCsv(csv: string): string[] {
    if (!csv) {
      return [];
    }
    const seen: { [key: string]: boolean } = {};
    const result: string[] = [];
    csv.split(",").forEach((raw) => {
      const email = raw.trim();
      if (email.length > 0 && !seen[email]) {
        seen[email] = true;
        result.push(email);
      }
    });
    return result;
  }

  export function listCalendars(): CalendarInfo[] {
    return CalendarApp.getAllCalendars().map((cal) => ({
      id: cal.getId(),
      name: cal.getName(),
    }));
  }

  function resolveCalendar(calendarId: string): GoogleAppsScript.Calendar.Calendar {
    if (calendarId === "primary") {
      return CalendarApp.getDefaultCalendar();
    }
    return CalendarApp.getCalendarById(calendarId);
  }

  function toItem(calendarId: string, event: GoogleAppsScript.Calendar.CalendarEvent): CalendarEventItem {
    return {
      id: event.getId(),
      calendarId: calendarId,
      title: event.getTitle(),
      start: event.getStartTime().toISOString(),
      end: event.getEndTime().toISOString(),
      allDay: event.isAllDayEvent(),
      guests: event.getGuestList().map((g) => g.getEmail()),
    };
  }

  /** 複数カレンダーの予定を期間指定でまとめて取得し、開始時刻順に整列する */
  export function getEvents(calendarIds: string[], startIso: string, endIso: string): CalendarEventItem[] {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const items: CalendarEventItem[] = [];
    calendarIds.forEach((calendarId) => {
      const calendar = resolveCalendar(calendarId);
      if (!calendar) {
        return;
      }
      calendar.getEvents(start, end).forEach((event) => {
        items.push(toItem(calendarId, event));
      });
    });
    return items.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }

  export function createEvent(
    calendarId: string,
    title: string,
    startIso: string,
    endIso: string,
    allDay: boolean,
    guestsCsv: string,
    description: string
  ): CalendarEventItem {
    const calendar = resolveCalendar(calendarId);
    const guests = parseGuestsCsv(guestsCsv);
    const options: { [key: string]: any } = { description: description };
    if (guests.length > 0) {
      options.guests = guests.join(",");
    }

    let event: GoogleAppsScript.Calendar.CalendarEvent;
    if (allDay) {
      event = calendar.createAllDayEvent(title, new Date(startIso), options);
    } else {
      event = calendar.createEvent(title, new Date(startIso), new Date(endIso), options);
    }
    return toItem(calendarId, event);
  }

  export function updateEvent(
    calendarId: string,
    eventId: string,
    title: string,
    startIso: string,
    endIso: string,
    guestsCsv: string,
    description: string
  ): CalendarEventItem {
    const calendar = resolveCalendar(calendarId);
    const event = calendar.getEventById(eventId);
    if (!event) {
      throw new Error("予定が見つかりません: " + eventId);
    }
    event.setTitle(title);
    if (!event.isAllDayEvent()) {
      event.setTime(new Date(startIso), new Date(endIso));
    }
    event.setDescription(description);

    const desiredGuests = parseGuestsCsv(guestsCsv);
    const currentGuests = event.getGuestList().map((g) => g.getEmail());
    desiredGuests
      .filter((email) => currentGuests.indexOf(email) === -1)
      .forEach((email) => event.addGuest(email));
    currentGuests
      .filter((email) => desiredGuests.indexOf(email) === -1)
      .forEach((email) => event.removeGuest(email));

    return toItem(calendarId, event);
  }

  export function deleteEvent(calendarId: string, eventId: string): void {
    const calendar = resolveCalendar(calendarId);
    const event = calendar.getEventById(eventId);
    if (event) {
      event.deleteEvent();
    }
  }
}
