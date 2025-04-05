const { Buffer } = require('buffer');

exports.handler = async function(event, context) {
  try {
    const body = JSON.parse(event.body);
    const pdfBase64 = body.body;

    // Placeholder logic: generate a sample .ics calendar
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'PRODID:-//Example Corp.//PDF to iCal//EN',
      'BEGIN:VEVENT',
      'UID:sample-event@example.com',
      `DTSTAMP:${now}`,
      'DTSTART;VALUE=DATE:20250201',
      'DTEND;VALUE=DATE:20250202',
      'SUMMARY:Sample Event',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar',
        'Content-Disposition': 'attachment; filename=converted-calendar.ics'
      },
      body: ics
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
