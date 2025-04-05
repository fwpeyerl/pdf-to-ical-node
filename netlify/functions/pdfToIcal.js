const { Buffer } = require('buffer');
const pdf = require('pdf-parse');

exports.handler = async function(event, context) {
  try {
    const { body: base64, timezone } = JSON.parse(event.body);
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdf(buffer);
    const text = data.text;

    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);

    const events = [];
    let currentDay = null;

    lines.forEach(line => {
      const dayAtEnd = line.match(/(.*)\s+(\d{1,2})$/);
      const dayAtStart = line.match(/^(\d{1,2}):\s+(.*)/);
      const timeEventPattern = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?[:\s-]+(.+)/i;

      if (dayAtEnd) {
        currentDay = parseInt(dayAtEnd[2]);
        line = dayAtEnd[1].trim();
      }

      if (dayAtStart) {
        currentDay = parseInt(dayAtStart[1]);
        line = dayAtStart[2];
      }

      if (currentDay !== null && line) {
        const timeMatch = line.match(timeEventPattern);
        if (timeMatch) {
          let [ , hour, minute = '00', ampm, title ] = timeMatch;
          hour = parseInt(hour);
          if (ampm) {
            if (ampm.toUpperCase() === 'PM' && hour < 12) hour += 12;
            if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
          }
          events.push({
            day: currentDay,
            title: title.trim(),
            hour,
            minute: parseInt(minute)
          });
        } else {
          events.push({
            day: currentDay,
            title: line,
            hour: null,
            minute: null
          });
        }
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
      const uid = Math.random().toString(36).substring(2) + '@pdfcalendar';
      linesOut.push('BEGIN:VEVENT');
      linesOut.push('UID:' + uid);
      linesOut.push('DTSTAMP:' + now);
      const dateStr = `202503${String(event.day).padStart(2, '0')}`;
      if (event.hour !== null) {
        const timeStr = `${String(event.hour).padStart(2, '0')}${String(event.minute).padStart(2, '0')}00`;
        linesOut.push(`DTSTART;TZID=${timezone}:${dateStr}T${timeStr}`);
        linesOut.push(`DTEND;TZID=${timezone}:${dateStr}T${timeStr}`);
      } else {
        linesOut.push(`DTSTART;VALUE=DATE:${dateStr}`);
        linesOut.push(`DTEND;VALUE=DATE:${dateStr}`);
      }
      linesOut.push('SUMMARY:' + event.title);
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
