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
    const seen = new Set();

    let currentDay = null;

    const timeApmRegex = /^(\d{1,2})(A|P)\s+(.+)/i;
    const timeClockRegex = /(\d{1,2}(?::\d{2})?)\s+(.+?)\s+\[(\w+)\]\s+(\d{1,2})$/;
    const timeClockLooseRegex = /(\d{1,2}(?::\d{2})?)\s+(.+?)\s+\[(\w+)\]$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match = null;

      if ((match = line.match(timeApmRegex))) {
        let [, hour, ampm, title] = match;
        hour = parseInt(hour);
        if (ampm.toUpperCase() === 'P' && hour < 12) hour += 12;
        if (ampm.toUpperCase() === 'A' && hour === 12) hour = 0;

        const dateKey = `feb-${currentDay}-${title}`;
        if (!seen.has(dateKey) && currentDay) {
          seen.add(dateKey);
          events.push({
            month: "02",
            day: currentDay,
            title: title.trim(),
            hour,
            minute: 0,
            location: null
          });
        }
        continue;
      }

      if ((match = line.match(timeClockRegex))) {
        let [, time, title, locCode, day] = match;
        const [hourStr, minStr = '00'] = time.split(':');
        const hour = parseInt(hourStr);
        const minute = parseInt(minStr);
        currentDay = parseInt(day);
        const key = `mar-${currentDay}-${title}`;
        if (!seen.has(key)) {
          seen.add(key);
          events.push({
            month: "03",
            day: currentDay,
            title: title.trim(),
            hour,
            minute,
            location: locationMap[locCode] || locCode
          });
        }
        continue;
      }

      if ((match = line.match(timeClockLooseRegex))) {
        let [, time, title, locCode] = match;
        const [hourStr, minStr = '00'] = time.split(':');
        const hour = parseInt(hourStr);
        const minute = parseInt(minStr);
        if (currentDay) {
          const key = `mar-${currentDay}-${title}`;
          if (!seen.has(key)) {
            seen.add(key);
            events.push({
              month: "03",
              day: currentDay,
              title: title.trim(),
              hour,
              minute,
              location: locationMap[locCode] || locCode
            });
          }
        }
        continue;
      }

      const dayMatch = line.match(/(.*)\s+(\d{1,2})$/);
      if (dayMatch) {
        currentDay = parseInt(dayMatch[2]);
      }
    }

    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const linesOut = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'PRODID:-//Quiltt//PDF Calendar to iCal//EN',
      'X-WR-CALNAME:PDF Calendar',
      'X-WR-TIMEZONE:' + timezone
    ];

    for (const event of events) {
      if (!event.day || !event.title) continue;
      const dateStr = `2025${event.month}${String(event.day).padStart(2, '0')}`;
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
    }

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
