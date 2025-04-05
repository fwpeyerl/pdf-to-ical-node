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
    const knownDayPrefixRegex = /^\d{1,2}\s+(\d{1,2}[AP])\s+(.+)/i;

    rawLines.forEach((line, index) => {
      const entry = { line: line, matched: false, result: null, index: index + 1 };

      let match;
      if ((match = line.match(dayOnlyRegex))) {
        currentDay = parseInt(match[0]);
        return;
      }

      if ((match = line.match(timeApmRegex))) {
        let [, hour, ampm, title] = match;
        hour = parseInt(hour);
        if (ampm.toUpperCase() === "P" && hour < 12) hour += 12;
        if (ampm.toUpperCase() === "A" && hour === 12) hour = 0;
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

      if ((match = line.match(knownDayPrefixRegex))) {
        // line looks like "2 9A Good News", skip because likely day mistake
        return;
      }

      // All day item fallback
      if (currentDay && line && !line.match(/^(\d{1,2}[AP])\s+/i)) {
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
      body: JSON.stringify({ parsed, debug: lines.slice(0, 40) })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
