const { Buffer } = require('buffer');
const pdf = require('pdf-parse');

exports.handler = async function(event, context) {
  try {
    const { body: base64 } = JSON.parse(event.body);
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdf(buffer);
    const text = data.text.replace(/\r/g, '').replace(/\s{2,}/g, ' ').trim();

    const lines = text.split(/\n|\r|\r\n/).map(line => line.trim()).filter(Boolean);
    const parsed = [];
    let currentDay = null;
    let currentMonth = "03";

    const timeApmRegex = /^(\d{1,2})(A|P)\s+(.+)/i;
    const timeColonRegex = /^(\d{1,2})(?::(\d{2}))?\s+(.+?)(?:\s+\[(\w{2})\])?(?:\s+(\d{1,2}))?$/;

    for (let line of lines) {
      let match;

      if ((match = line.match(timeApmRegex))) {
        let [, hour, ampm, title] = match;
        hour = parseInt(hour);
        if (ampm.toUpperCase() === "P" && hour < 12) hour += 12;
        if (ampm.toUpperCase() === "A" && hour === 12) hour = 0;
        currentMonth = "02";
        parsed.push({
          month: currentMonth,
          day: currentDay,
          title: title.trim(),
          hour,
          minute: 0,
          location: ""
        });
        continue;
      }

      if ((match = line.match(timeColonRegex))) {
        let [, hour, minute = "00", title, locCode, day] = match;
        hour = parseInt(hour);
        minute = parseInt(minute);
        if (day) currentDay = parseInt(day);
        parsed.push({
          month: currentMonth,
          day: currentDay,
          title: title.trim(),
          hour,
          minute,
          location: locCode || ""
        });
        continue;
      }

      const dayMatch = line.match(/\b(\d{1,2})$/);
      if (dayMatch) currentDay = parseInt(dayMatch[1]);
    }

    return {
      statusCode: 200,
      body: JSON.stringify(parsed.slice(0, 20))
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
