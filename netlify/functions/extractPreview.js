const { Buffer } = require('buffer');
const pdf = require('pdf-parse');

exports.handler = async function(event, context) {
  try {
    const { body: base64 } = JSON.parse(event.body);
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdf(buffer);
    const rawLines = data.text.split(/\n|\r|\r\n/).map(l => l.trim()).filter(Boolean);

    const lines = [];
    let currentDay = null;
    let currentMonth = "03";

    const timeApmRegex = /^(\d{1,2})(A|P)\s+(.+)/i;
    const timeColonRegex = /^(\d{1,2})(?::(\d{2}))?\s+(.+?)(?:\s+\[(\w{2})\])?(?:\s+(\d{1,2}))?$/;

    rawLines.forEach((line, index) => {
      const entry = { line: line, matched: false, result: null, index: index + 1 };

      let match;
      if ((match = line.match(timeApmRegex))) {
        let [, hour, ampm, title] = match;
        hour = parseInt(hour);
        if (ampm.toUpperCase() === "P" && hour < 12) hour += 12;
        if (ampm.toUpperCase() === "A" && hour === 12) hour = 0;
        currentMonth = "02";
        entry.matched = true;
        entry.result = {
          month: currentMonth,
          day: currentDay,
          title: title.trim(),
          hour,
          minute: 0,
          location: ""
        };
        lines.push(entry);
        return;
      }

      if ((match = line.match(timeColonRegex))) {
        let [, hour, minute = "00", title, locCode, day] = match;
        hour = parseInt(hour);
        minute = parseInt(minute);
        if (day) currentDay = parseInt(day);
        entry.matched = true;
        entry.result = {
          month: currentMonth,
          day: currentDay,
          title: title.trim(),
          hour,
          minute,
          location: locCode || ""
        };
        lines.push(entry);
        return;
      }

      const dayMatch = line.match(/\b(\d{1,2})$/);
      if (dayMatch) currentDay = parseInt(dayMatch[1]);

      lines.push(entry);
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ parsed: lines.filter(e => e.matched).map(e => e.result), debug: lines.slice(0, 40) })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
