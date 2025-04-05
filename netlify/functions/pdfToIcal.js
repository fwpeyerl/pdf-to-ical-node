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
    const regex = /^(\d{1,2})(?:\s+(\d{1,2})([AP]M))?\s+(.+)/i;

    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        const day = parseInt(match[1]);
        const timeHour = match[2] ? parseInt(match[2]) : null;
        const ampm = match[3];
        const title = match[4];

        let hour24 = timeHour;
        if (ampm === 'PM' && timeHour < 12) hour24 += 12;
        if (ampm === 'AM' && timeHour === 12) hour24 = 0;

        events.push({
          day,
          title,
          hour: hour24,
          minute: 0
        });
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
      const uid = Math.random().toString(36).substring(2) + '@pdfcalendar';
      linesOut.push('BEGIN:VEVENT');
      linesOut.push('UID:' + uid);
      linesOut.push('DTSTAMP:' + now);

      const dateStr = `202502${String(event.day).padStart(2, '0')}`;
      if (event.hour != null) {
        const dt = dateStr + 'T' + String(event.hour).padStart(2, '0') + '00' + '00';
        linesOut.push(`DTSTART;TZID=${timezone}:${dt}`);
        linesOut.push(`DTEND;TZID=${timezone}:${dt}`);
      } else {
        linesOut.push(`DTSTART;VALUE=DATE:${dateStr}`);
        linesOut.push(`DTEND;VALUE=DATE:${dateStr}`);
      }

      linesOut.push('SUMMARY:' + event.title);
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
