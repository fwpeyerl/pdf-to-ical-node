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
    let currentMonth = "03";  // Default to March, updated dynamically later

    const timeApmRegex = /^(\d{1,2})(A|P)\s+(.+)/i;
    const timeColonRegex = /^(\d{1,2})(?::(\d{2}))?\s+(.+?)(?:\s+\[(\w+)\])?(?:\s+(\d{1,2}))?$/;

    for (let line of lines) {
      let match;

      // Detect and update current day from end of line if present
      const dayAtEnd = line.match(/\b(\d{1,2})$/);
      if (dayAtEnd) currentDay = parseInt(dayAtEnd[1]);

      // Try matching A/P format (February style)
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
              title: title,
              hour,
              minute: 0,
              location: null
            });
          }
        }
        continue;
      }

      // Try matching 1:30 style format with optional location and day
      if ((match = line.match(timeColonRegex))) {
        let [, hour, minute = "00", title, locCode, day] = match;
        hour = parseInt(hour);
        minute = parseInt(minute);
        if (day) currentDay = parseInt(day);
        if (!currentDay) continue;
        const key = `mar-${currentDay}-${title}`;
        if (!seen.has(key)) {
          seen.add(key);
          events.push({
            day: currentDay,
            month: "03",
            title: title,
            hour,
            minute,
            location: locCode ? locationMap[locCode] || locCode : null
          });
        }
        continue;
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
