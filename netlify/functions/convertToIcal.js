exports.handler = async function(event, context) {
  try {
    const { events, timezone } = JSON.parse(event.body);
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const linesOut = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'PRODID:-//Quiltt//PDF Calendar to iCal//EN',
      'X-WR-CALNAME:PDF Calendar',
      'X-WR-TIMEZONE:' + timezone
    ];

    for (const e of events) {
      const dateStr = `2025${e.month}${String(e.day).padStart(2, '0')}`;
      const uid = Math.random().toString(36).substring(2) + '@pdfcalendar';
      const timeStr = `${String(e.hour).padStart(2, '0')}${String(e.minute).padStart(2, '0')}00`;

      linesOut.push('BEGIN:VEVENT');
      linesOut.push('UID:' + uid);
      linesOut.push('DTSTAMP:' + now);
      linesOut.push(`DTSTART;TZID=${timezone}:${dateStr}T${timeStr}`);
      linesOut.push(`DTEND;TZID=${timezone}:${dateStr}T${timeStr}`);
      linesOut.push('SUMMARY:' + e.title);
      if (e.location) {
        linesOut.push('LOCATION:' + e.location);
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
