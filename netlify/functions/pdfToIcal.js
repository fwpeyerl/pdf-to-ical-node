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
    const text = data.text.replace(/\r/g, '').replace(/  +/g, ' ');

    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const events = [];
    const seen = new Set();

    let currentDay = null;

    const timeApmRegex = /^(\d{1,2})(A|P)\s+(.+)/i;
    const timeLocationDayRegex = /^(\d{1,2})(?::(\d{2}))?\s+(.+?)\s+\[(\w+)\]\s+(\d{1,2})$/;
    const timeLocationLooseRegex = /^(\d{1,2})(?::(\d{2}))?\s+(.+?)\s+\[(\w+)\]$/;

    for (let line of lines) {
      let match;

      // Match format like "9A Good News"
      if ((match = line.match(timeApmRegex))) {
        let [, hour, ampm, title] = match;
        hour = parseInt(hour);
        if (ampm.toUpperCase() === "P" && hour < 12) hour += 12;
        if (ampm.toUpperCase() === "A" && hour === 12) hour = 0;

        if (currentDay) {
          const key = `feb-${currentDay}-${title}`;
          if (!seen.has(key)) {
            seen.add(key);
            events.push({
              day: currentDay,
              month: "02",
              title: title.trim(),
              hour,
              minute: 0,
              location: null
            });
          }
        }
        continue;
      }

      // Match format like "1:30 Senior Link short clips [MC] 3"
      if ((match = line.match(timeLocationDayRegex))) {
        let [, hour, minute = "00", title, locCode, day] = match;
        hour = parseInt(hour);
        minute = parseInt(minute);
        currentDay = parseInt(day);
        const key = `mar-${currentDay}-${title}`;
        if (!seen.has(key)) {
          seen.add(key);
          events.push({
            day: currentDay,
            month: "03",
            title: title.trim(),
            hour,
            minute,
            location: locationMap[locCode] || locCode
          });
        }
        continue;
      }

      // Match format like "1:30 1:1 with Sami [MC]" (multi-token titles, no day)
      if ((match = line.match(timeLocationLooseRegex))) {
        let [, hour, minute = "00", title, locCode] = match;
        hour = parseInt(hour);
        minute = parseInt(minute);
        if (currentDay) {
          const key = `mar-${currentDay}-${title}`;
          if (!seen.has(key)) {
            seen.add(key);
            events.push({
              day: currentDay,
              month: "03",
              title: title.trim(),
              hour,
              minute,
              location: locationMap[locCode] || locCode
            });
          }
        }
        continue;
      }

      // Update currentDay from any trailing day number
      const dayMatch = line.match(/(\d{1,2})$/);
      if (dayMatch) {
        currentDay = parseInt(dayMatch[1]);
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
      const dateStr = `2025${event.month}${String(event.day).padStart(2, '0')}`;
      const uid = Math.random().toString(36).substring(2) + '@pdfcalendar';

      linesOut.push('BEGIN:VEVENT');
      linesOut.push('UID:' + uid);
      linesOut.push('DTSTAMP:' + now);

      const timeStr = `${String(event.hour).padStart(2, '0')}${String(event.minute).padStart(2, '0')}00`;
      linesOut.push(`DTSTART;TZID=${timezone}:${dateStr}T${timeStr}`);
      linesOut.push(`DTEND;TZID=${timezone}:${dateStr}T${timeStr}`);
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
