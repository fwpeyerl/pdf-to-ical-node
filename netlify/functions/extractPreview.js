const { Buffer } = require('buffer');
const pdf = require('pdf-parse');

function isFebruaryStyle(lines) {
  return lines.some(line => /\d{1,2}[AP]\s+/.test(line) || line.includes("Daily puzzler"));
}

exports.handler = async function(event, context) {
  try {
    const { body: base64 } = JSON.parse(event.body);
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdf(buffer);
    const rawLines = data.text.split(/\n|\r|\r\n/).map(l => l.trim()).filter(Boolean);

    if (!isFebruaryStyle(rawLines)) {
      return { statusCode: 200, body: JSON.stringify({ parsed: [], debug: ["Not a supported calendar format."] }) };
    }

    const lines = [];
    let currentDay = null;
    let currentMonth = "02";

    const timeApmRegex = /^(\d{1,2})(A|P)\s+(.+)/i;
    const dayOnlyRegex = /^\d{1,2}$/;
    const splitDayAndEventRegex = /^(\d{1,2})\s+(\d{1,2})(A|P)\s+(.+)/i;

    rawLines.forEach((line, index) => {
      const entry = { line, matched: false, result: null, index: index + 1 };

      // Split lines like "2 9A Good News"
      const splitMatch = line.match(splitDayAndEventRegex);
      if (splitMatch) {
        const [, dayStr, hourStr, ampm, title] = splitMatch;
        currentDay = parseInt(dayStr);
        let hour = parseInt(hourStr);
        if (ampm.toUpperCase() === "P" && hour < 12) hour += 12;
        if (ampm.toUpperCase() === "A" && hour === 12) hour = 0;
        entry.matched = true;
        entry.result = {
          month: currentMonth,
          day: currentDay + 1,  // Event goes to *next* day
          title: title.trim(),
          hour,
          minute: 0,
          location: ""
        };
        lines.push(entry);
        return;
      }

      // Match single day on a line
      const dayMatch = line.match(dayOnlyRegex);
      if (dayMatch) {
        currentDay = parseInt(dayMatch[0]);
        return;
      }

      // Match "9A Good News"
      const match = line.match(timeApmRegex);
      if (match) {
        let [, hour, ampm, title] = match;
        hour = parseInt(hour);
        if (ampm.toUpperCase() === "P" && hour < 12) hour += 12;
        if (ampm.toUpperCase() === "A" && hour === 12) hour = 0;
        if (currentDay) {
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
        }
        return;
      }

      // Match all-day event
      if (currentDay && line && !line.match(timeApmRegex)) {
        entry.matched = true;
        entry.result = {
          month: currentMonth,
          day: currentDay,
          title: line.trim(),
          hour: null,
          minute: null,
          location: ""
        };
        lines.push(entry);
      }
    });

    const parsed = lines.filter(e => e.matched).map(e => e.result);
    return {
      statusCode: 200,
      body: JSON.stringify({ parsed, debug: lines.slice(0, 60) })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
