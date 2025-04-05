const { Buffer } = require('buffer');
const pdf = require('pdf-parse');
const locationMap = {
  MC: "Memory Care",
  FA: "Family Area",
  TS: "Therapy Suite"
};

exports.handler = async function(event, context) {
  try {
    const { body: base64, timezone } = JSON.parse(event.body);
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdf(buffer);
    const text = data.text;

    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const events = [];

    let currentDay = null;

    const timeApmRegex = /^(\d{1,2})(A|P)\s+(.+)/i;
    const timeClockRegex = /(\d{1,2}(?::\d{2})?)\s+(.+?)\s+\[(\w+)\]\s+(\d{1,2})$/;
    const timeClockLooseRegex = /(\d{1,2}(?::\d{2})?)\s+(.+?)\s+\[(\w+)\]$/;

    lines.forEach((line, idx) => {
      let match = null;

      // Match "9A Good News" style (Feb)
      if ((match = line.match(timeApmRegex))) {
        let [, hour, ampm, title] = match;
        hour = parseInt(hour);
        if (ampm.toUpperCase() === 'P' && hour < 12) hour += 12;
        if (ampm.toUpperCase() === 'A' && hour === 12) hour = 0;
        events.push({
          day: currentDay,
          title: title.trim(),
          hour,
          minute: 0,
          location: null
        });
        return;
      }

      // Match "1:30 Title [MC] 1" style (March)
      if ((match = line.match(timeClockRegex))) {
        let [_, time, title, locCode, day] = match;
        let [hour, minute = '00'] = time.split(':');
        hour = parseInt(hour);
        minute = parseInt(minute);
        currentDay = parseInt(day);
        events.push({
          day: currentDay,
          title: title.trim(),
          hour,
          minute,
          location: locationMap[locCode] || locCode
        });
        return;
      }

      // Match "1:30 Title [MC]" style (loose)
      if ((match = line.match(timeClockLooseRegex))) {
        let [_, time, title, locCode] = match;
        let [hour, minute = '00'] = time.split(':');
        hour = parseInt(hour);
        minute = parseInt(minute);
        if (currentDay !== null) {
          events.push({
            day: currentDay,
            title: title.trim(),
            hour,
            minute,
            location: locationMap[locCode] || locCode
          });
        }
        return;
      }

      // Match lines ending in a number (used for currentDay)
      const dayAtEnd = line.match(/(.*)\s+(\d{1,2})$/);
      if (dayAtEnd) {
        currentDay = parseInt(dayAtEnd[2]);
      }
    });

    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const linesOut = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'PRODID:-//Quiltt//PDF Calendar to iCal//EN',
      'X-WR-CALNAME:PDF Calendar',
      'X-WR-TIMEZONE:' + timezone
    ];

    events.forEach(event => {
      if (!event.day || !event.title) return;

      const dateStr = `202503${String(event.day).padStart(2, '0')}`;
      const uid = Math.random().toString(36).substring(2) + '@pdfcalendar';

      linesOut.push('BEGIN:VEVENT');
      linesOut.push('UID:' + uid);
      linesOut.push('DTSTAMP:' + now);

      if (event.hour != null) {
        const timeStr = `${String(event.hour).padStart(2, '0')}${String(event.minute).padStart(2, '0')}00`;
        linesOut.push(`DTSTART;TZID=${timezone}:${dateStr}T${timeStr}`);
        linesOut.push(`DTEND;TZID=${timezone}:${dateStr}T${timeStr}`);
      } else {
        linesOut.push(`DTSTART;VALUE=DATE:${dateStr}`);
        linesOut.push(`DTEND;VALUE=DATE:${dateStr}`);
      }

      linesOut.push('SUMMARY:' + event.title);
      if (event.location) {
        linesOut.push('LOCATION:' + event.location);
      }
      linesOut.push('END:VEVENT');
    });

    linesOut.push('END:VCALENDAR');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar',
        'Content-Disposition': 'attachment; filename=converted-calendar.ics'
      },
      body: linesOut.join('\r\n')
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
